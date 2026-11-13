#!/usr/bin/env python3
"""Builds src/game/data/levels/lab.js (the physics lab / sandbox seed, ?level=lab) with tools/levelkit.py.

    python tools/build_lab.py

Three furnished rooms on three floor materials (wood, carpet, tiles: each has loose objects to shove around),
every kind of door and window, the whole arsenal laid out in front of the building, and a street with the three
vehicles. The guards are passive dummies.
"""
from levelkit import Level

W, H = 34, 23
lv = Level(W, H)

# ---------------------------------------------------------------- tiles
lv.fill(1, 1, 10, 8, '.')
lv.fill(12, 1, 21, 8, ':')
lv.fill(23, 1, 32, 8, '+')
lv.fill(11, 1, 11, 8, '#')
lv.fill(22, 1, 22, 8, '#')
lv.put(11, 4, 'D')
lv.put(11, 7, 'G')
lv.put(22, 3, 'D')
lv.put(22, 4, 'D')          # double door
lv.put(22, 7, 'G')
# facade: locked door, windows, double door, single door
for x, ch in ((4, 'L'), (6, 'G'), (7, 'G'), (13, 'G'), (16, 'D'), (17, 'D'), (20, 'G'), (25, 'G'), (27, 'D'), (30, 'G')):
    lv.put(x, 9, ch)
lv.fill(1, 10, 32, 10, '_')
lv.fill(1, 11, 32, 12, 's')
lv.fill(1, 13, 32, 19, '=')
lv.fill(1, 17, 32, 17, '-')
lv.fill(1, 20, 32, 21, 's')

# ---------------------------------------------------------------- actors
lv.actor('@', 15, 12, face=270)
# the arsenal, each gun with its ammo under it
for i, ch in enumerate('123456789'):
    lv.actor(ch, 8 + 2 * i, 10)
for x, ch in ((8, 'n'), (10, 'z'), (12, 'g'), (14, 'v'), (20, 'z'), (22, 'q'), (24, 'w')):
    lv.actor(ch, x, 11)
# one dummy of each kind
lv.actor('p', 5, 5, face=90)
lv.actor('k', 9, 7, face=180)
lv.actor('h', 19, 3, face=180)
lv.actor('b', 30, 5, face=180)
lv.actor('u', 27, 12, face=180)
lv.actor('s', 6, 20, face=0)
lv.actor('r', 28, 20, face=180)

# ---------------------------------------------------------------- props
lv.area('room A, wood: bar corner, pool table, tv corner')
lv.prop('bookshelf', 1.75, 1.2)
lv.prop('neon_tube_pink', 3.4, 1.07)
for i in range(3):
    lv.prop('bar_counter', 1.5 + i, 2.6)
    lv.prop('chair', 1.6 + i, 3.35, 270)
lv.prop('ceiling_lamp', 2.5, 2.6)
lv.prop('pool_table', 7.6, 2.6)
lv.prop('pool_lamp', 7.6, 2.6)
lv.prop('plant', 10.4, 1.45)
lv.prop('arcade', 10.55, 5.4, 90)
lv.prop('tv', 1.3, 6.9, 270)
lv.prop('table', 2.7, 6.9, 90)
lv.prop('sofa', 4.0, 6.9, 90)
lv.prop('floor_lamp', 1.4, 8.5)
lv.prop('jukebox', 9.3, 8.6, 180)
lv.prop('wall_lamp', 5.5, 8.91, 180)
lv.prop('chair', 6.3, 4.8)
lv.prop('crate', 7.3, 4.8)
lv.prop('trash_can', 8.3, 4.8)

lv.area('room B, carpet: bedroom, office, dj corner')
lv.prop('bed', 13.0, 2.2)
lv.prop('table_lamp', 14.1, 1.4)
lv.prop('bookshelf', 15.0, 1.2)
lv.prop('desk', 17.6, 1.5)
lv.prop('chair', 17.6, 2.25, 270)
lv.prop('floor_lamp', 20.5, 1.4)
lv.prop('sofa', 20.5, 5.5, 90)
lv.prop('neon_tube_cyan', 21.93, 5.5, 90)
lv.prop('table_round', 14.5, 5.6)
lv.prop('chair', 14.5, 4.75, 90)
lv.prop('chair', 13.65, 5.6, 0)
lv.prop('chair', 15.35, 5.6, 180)
lv.prop('ceiling_lamp', 14.5, 5.6)
lv.prop('dj_booth', 14.0, 8.4, 180)
lv.prop('speaker', 12.6, 8.5)
lv.prop('speaker', 15.4, 8.5)
lv.prop('plant', 21.5, 8.5)
lv.prop('chair', 17.2, 4.8)
lv.prop('crate', 18.2, 4.8)
lv.prop('trash_can', 19.2, 4.8)

lv.area('room C, tiles: kitchen, toilets, storage')
lv.prop('fridge', 23.45, 1.4)
lv.prop('oven', 24.3, 1.4)
lv.prop('sink', 25.25, 1.35)
lv.prop('tube_light', 28.0, 1.07)
lv.prop('toilet', 30.4, 1.4)
lv.prop('toilet', 31.6, 1.4)
lv.prop('sink', 32.65, 3.0, 90)
lv.prop('table', 27.5, 4.6)
lv.prop('chair', 27.0, 3.85, 90)
lv.prop('chair', 28.0, 3.85, 90)
lv.prop('chair', 27.0, 5.35, 270)
lv.prop('chair', 28.0, 5.35, 270)
lv.prop('trash_can', 25.0, 5.0)
lv.prop('crate', 23.5, 7.5)
lv.prop('crate', 24.2, 7.6, 8)
lv.prop('crate', 23.8, 6.85, -12)
lv.prop('barrel', 26.2, 8.3)
lv.prop('barrel', 31.5, 7.9)
lv.prop('wall_lamp', 29.0, 8.91, 180)

lv.area('facade')
lv.prop('neon_sign_arrow', 2.0, 10.09)
lv.prop('wall_lamp', 18.6, 10.09)
lv.prop('neon_sign_bar', 22.5, 10.09)
lv.prop('string_lights', 29.5, 10.6)

lv.area('street')
lv.prop('palm_tree', 1.6, 11.6)
lv.prop('palm_tree', 32.4, 11.6)
lv.prop('streetlight', 2.9, 12.7, 90)
lv.prop('streetlight', 31.4, 12.7, 90)
lv.prop('trash_can', 3.8, 12.4)
lv.prop('hydrant', 20.5, 12.6)
lv.prop('car', 6.5, 14.0, 0)
lv.prop('car2', 16.5, 14.0, 180)
lv.prop('van', 27.0, 14.1, 0)
lv.prop('barrel', 11.5, 16.2)
lv.prop('barrel', 22.5, 16.2)
lv.prop('streetlight', 17.0, 20.3, 270)
lv.prop('bench', 10.0, 21.6, 180)
lv.prop('trash_can', 12.0, 21.6)
lv.prop('neon_sign_palm', 22.0, 21.91, 180)
lv.prop('trash_can', 28.6, 21.5)
lv.prop('dumpster', 30.5, 21.2)

lights = [
    [8, 16.5, 9, '#5a6ad8', 0.3],
    [25, 16.5, 9, '#7a5ad8', 0.3],
]

if __name__ == '__main__':
    lv.check(guards=7)
    lv.write('lab', name='PHYSICS LAB', subtitle='SANDBOX  -  EVERY PROP, WEAPON AND VEHICLE', passive=True, lights=lights,
             header=[
                 'Physics lab: three furnished rooms on three floor materials, every door, window, prop, weapon and ammo type,',
                 'and a street with the vehicles. Load with ?level=lab. Guards here are passive dummies (they never see or hear you).',
             ])
