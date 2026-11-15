"""Build src/game/data/levels/tutorial.js: the tutorial, an apartment, a memory of the night it went wrong.

    python tools/build_tutorial.py

Six rooms played one after the other (src/game/systems/Tutorial.js: the guards of a room sleep until its turn, a
retry starts again at the last room reached), each asking for one move, said next to what it is done to:

    bedroom, hall   he wakes by his bed: move, aim
    living room     the woman he heard scream lies there, shot; the man who did it stands in front of the
                    television, his back to the door: seize him from behind
    kitchen         a man at the worktop: a punch floors him, a bat lies by the table to finish him with; another
                    comes out of the pantry: strike
    corridor        a man with a pistol at its far end: run and slide under his fire
    study           a pistol with two rounds on the floor, two men come at him, a third from the next room: shoot,
                    then throw the empty gun, then finish the man it floored
    front room      the big window: dive through it. He falls, and wakes in the alley of level 1.
"""
from levelkit import Level

W, H = 34, 19
lv = Level(W, H)

# ---------------------------------------------------------------- tiles
lv.fill(1, 1, 29, 17, '#')            # the flat: plaster inside, brick round it
lv.fill(1, 1, 5, 5, ';')              # bedroom
lv.put(0, 3, 'G')                     # its window on the street (the title's travelling comes in by it)
lv.put(6, 3, 'D')
lv.fill(7, 1, 8, 6, '.')              # hall
lv.put(9, 3, 'D')
lv.fill(10, 1, 16, 6, ':')            # living room
lv.put(12, 7, 'D')
lv.fill(10, 8, 16, 13, ',')           # kitchen
lv.put(17, 10, 'D')
lv.fill(18, 9, 19, 11, '_')           # pantry
lv.put(13, 14, 'D')
lv.fill(12, 15, 21, 16, '.')          # corridor: eight metres to cross under his fire
lv.put(22, 15, 'D')
lv.fill(23, 10, 28, 17, ';')          # study
lv.put(25, 9, 'D')
lv.fill(23, 2, 28, 8, '.')            # front room
for row in (4, 5, 6):
    lv.put(29, row, 'G')              # the big window
lv.fill(30, 1, 32, 9, '=')            # the night outside, four floors down

# ---------------------------------------------------------------- actors (7 men)
lv.actor('@', 4, 3, face=0)
lv.actor('j', 14, 3, face=0)                            # in front of the television, his back to the door
lv.actor('j', 11, 11, face=180)                         # at the worktop
lv.actor('m', 19, 10, face=180)                         # in the pantry: comes out when the first one is dead
lv.actor('p', 21, 15, face=180)                         # the far end of the corridor, a pistol
lv.actor('j', 27, 11, face=90)                          # the study
lv.actor('m', 28, 13, face=180)
lv.actor('k', 26, 4, face=90)                           # the front room: comes when the two of the study are dead
lv.body('civ2', 13.5, 4.75, 195, 20)                    # her: what he heard from his bed. The man stands over her
lv.drop('bat', 13.2, 12.3, 25)
lv.drop('pistol', 24.2, 15.5, 200, rounds=2)

lv.guard(0, 0, W - 1, H - 1)                            # nobody is a guest here

# ---------------------------------------------------------------- props
lv.area('bedroom')
lv.prop('bed', 2.2, 2.05)
lv.prop('table_lamp', 3.45, 1.4)
lv.prop('bookshelf', 3.4, 5.78, 180)
lv.prop('plant', 5.45, 5.45)
lv.prop('chair', 5.4, 1.5, 200)

lv.area('hall')
lv.prop('ceiling_lamp', 8.0, 3.5)
lv.prop('plant', 7.45, 6.45)
lv.prop('crate', 8.5, 1.45, 8)

lv.area('living room')
lv.prop('tv', 16.6, 3.5, 90)
lv.prop('sofa', 12.3, 3.5, 270)
lv.prop('floor_lamp', 16.5, 1.45)
lv.prop('bookshelf', 13.5, 1.22)
lv.prop('plant', 10.5, 1.5)
lv.prop('armchair', 15.4, 5.5, 215)
lv.prop('table_round', 11.2, 5.5)
lv.prop('speaker', 16.5, 5.6)

lv.area('kitchen')
lv.prop('fridge', 10.42, 9.0, 270)
lv.prop('oven', 10.38, 10.6, 270)
lv.prop('sink', 10.34, 12.2, 270)
lv.prop('table', 14.2, 10.4)
lv.prop('chair', 14.2, 9.55, 90)
lv.prop('chair', 15.25, 10.5, 180)
lv.prop('tube_light', 13.5, 8.07)
lv.prop('trash_can', 16.5, 13.5)
lv.prop('crate', 19.5, 9.4, 6)                          # the pantry
lv.prop('crate', 19.5, 11.5, -8)

lv.area('corridor')
lv.prop('wall_lamp', 14.5, 15.09)
lv.prop('wall_lamp', 18.5, 15.09)
lv.prop('plant', 12.45, 16.5)

lv.area('study')
lv.prop('desk', 26.6, 16.5, 180)
lv.prop('armchair', 26.6, 15.4, 0)
lv.prop('bookshelf', 27.2, 10.22)                     # clear of the front room's door
lv.prop('floor_lamp', 28.5, 10.5)
lv.prop('sofa', 23.5, 12.2, 270)
lv.prop('plant', 23.45, 17.5)
lv.prop('table_lamp', 28.45, 17.4)

lv.area('front room')
lv.prop('sofa', 25.6, 2.5)
lv.prop('plant', 23.45, 2.5)
lv.prop('floor_lamp', 28.5, 2.5)
lv.prop('tv', 23.4, 5.5, 270)
lv.prop('ceiling_lamp', 26.0, 5.5)
lv.prop('armchair', 24.4, 7.5, 300)

# ---------------------------------------------------------------- the lesson
lv.tutorial = {
    'stages': [
        {'zone': [1, 1, 8, 6], 'spawn': [4.5, 3.5, 0], 'hints': ['move']},
        {'zone': [10, 1, 16, 6], 'spawn': [8.0, 3.5, 0], 'hints': ['finish', 'takedown'],
         'waves': [{'at': [[14, 3]], 'on': 'never', 'blind': True}]},
        {'zone': [10, 8, 16, 13], 'spawn': [12.5, 6.2, 90], 'take': 'bat', 'hints': ['finish', 'take', 'strike', 'punch'],
         'waves': [{'at': [[11, 11]], 'on': 'never', 'blind': True}, {'at': [[19, 10]], 'on': 'kills:1'}]},
        {'zone': [12, 15, 21, 16], 'spawn': [13.5, 13.2, 90], 'marks': {'slide': [14.3, 15.5]}, 'hints': ['finish', 'slide'],
         'waves': [{'at': [[21, 15]], 'on': 'enter'}]},
        {'zone': [23, 10, 28, 17], 'spawn': [20.5, 15.5, 0], 'take': 'pistol', 'hints': ['finish', 'take', 'throw', 'shoot'],
         'waves': [{'at': [[27, 11], [28, 13]], 'on': 'pickup:pistol'}, {'at': [[26, 4]], 'on': 'kills:2'}]},
        {'zone': [23, 2, 28, 8], 'spawn': [25.5, 10.6, 270], 'marks': {'dive': [28.4, 5.5]}, 'hints': ['finish', 'dive']},
    ],
    'fall': [30, 1, 32, 9],
}

lights = [
    [3, 3, 5, '#6a5ad8', 0.3],
    [13, 4, 6, '#7a5ad8', 0.25],
    [26, 5, 6, '#5a6ad8', 0.25],
]

if __name__ == '__main__':
    lv.check(guards=7)
    lv.write('tutorial', name='BAD NIGHT', subtitle='SUNSET BAY  -  MARCH 14TH 1986  -  1:05 AM', lights=lights,
             objective=['GET OUT OF THE APARTMENT', 'THROUGH THE FRONT ROOM WINDOW'],
             header=[
                 'The tutorial - "BAD NIGHT": an apartment, a memory. Six rooms, one move each (src/game/systems/Tutorial.js);',
                 'it ends through the front room window, and he wakes in the alley of level 1.',
             ])
