"""Build src/game/data/levels/tutorial.js: the tutorial, the night his flat burned.

    python tools/build_tutorial.py

He ran packages for the bar's boss for six years and kept every dollar under his floor, to leave town. Tonight the
boss closes the account: his men take the money back and burn the place with him in it (the opening tells it:
src/game/ui/Cinematic.js). He wakes in his bedroom and has to get out: his flat, its front door, the corridor of the
building with the neighbours' doors, the landing where more of them come up the stairs, the window at the corridor's
end. The flat catches fire room after room behind him (`fires`, src/game/systems/Fires.js).

Each place asks for one move, said next to what it is done to (src/game/systems/Tutorial.js: the guards of a place
sleep until its turn, a retry starts again at the last place reached). Till then they see and hear nothing but are
busy at something (their `job`, src/game/data/posts.js):

    bedroom         he wakes by his bed: move, aim
    living room     the man who poured the petrol, his back to the door by the hole they tore in the floor, the
                    jerrycan put down, a matchbox in his hand ('arson'). As he walks in the man strikes a match,
                    shields it a moment and lets it fall: the room goes up from where it lands (`spark`,
                    src/game/systems/Fires.js). Seize him from behind: too late, the match falls anyway
    kitchen         a man turning it over for the money, drawers pulled out, the fridge emptied on the floor
                    ('rummage'): a punch floors him, a bat lies by the table to finish him with; the lookout smoking at
                    the front door in the entrance hall ('hall') comes in when he is dead: strike
    the corridor    out of his front door: at the far end of the long corridor a man waits, his pistol out, smoking,
                    his eyes on the corner ('lookout'). Run and slide under his fire. The gun he drops has two rounds
                    left in it.
    the landing     three of them come up the stairs, heard before they are seen (`up`): shoot, throw the empty gun,
                    finish the man it floored
    the window      at the corridor's end: dive through it. He lands in the alley, and level 1 is the next night.
"""
from levelkit import Level

W, H = 40, 20
lv = Level(W, H)
SHOOTER = 0.35   # the corridor's gunman fires as he comes round the corner: the shot is what he slides under
STAIRS = [31.0, 11.35]  # where the men coming up the stairs step onto the landing

# ---------------------------------------------------------------- tiles
lv.fill(1, 1, 34, 18, '#')            # the building: plaster inside, brick round it
lv.fill(1, 1, 5, 5, ';')              # his bedroom
lv.put(0, 3, 'G')                     # its window on the street: the title looks out of it
lv.put(6, 3, 'D')
lv.fill(7, 1, 13, 6, ':')             # living room
lv.put(10, 7, 'D')
lv.fill(7, 8, 13, 12, '+')            # kitchen
lv.put(14, 10, 'D')
lv.fill(15, 8, 16, 12, '.')           # entrance hall
lv.put(17, 10, 'D')                   # his front door
lv.fill(18, 2, 19, 17, ',')           # the building's corridor, north to south ...
lv.fill(20, 16, 34, 17, ',')          # ... then east to its window
lv.fill(29, 11, 33, 15, '_')          # the landing, open on the corridor; the stairs go down from its north side
for row in (16, 17):
    lv.put(35, row, 'G')              # the window at the corridor's end
lv.fill(36, 14, 38, 19, '=')          # the night outside, two floors over the alley

# ---------------------------------------------------------------- actors (7 men)
lv.actor('@', 4, 3, face=0)
lv.actor('j', 11, 3, face=0, job='arson')               # the petrol poured, the match to come, his back to the door
lv.actor('j', 8, 11, face=180, job='rummage')           # at the kitchen worktop, turning the drawers out
lv.actor('m', 16, 10, face=0, job='hall')               # at the front door, smoking: comes when the first one is dead
lv.actor('p', 26, 16, face=180, job='lookout')          # down the corridor, a pistol, close enough to be seen
lv.actor('j', 30, 12, face=90)                          # coming up the stairs when he takes the gun
lv.actor('m', 32, 12, face=90)
lv.actor('k', 31, 11, face=90)                          # and a third when those two are dead
lv.drop('bat', 11.0, 11.6, 25)

lv.guard(0, 0, W - 1, H - 1)                            # nobody is a guest here

# ---------------------------------------------------------------- props
lv.area('his bedroom')
lv.prop('bed', 2.2, 2.05)
lv.prop('table_lamp', 3.45, 1.4)
lv.prop('bookshelf', 3.4, 5.78, 180)
lv.prop('plant', 5.45, 5.45)
lv.prop('chair', 5.4, 1.5, 200)

lv.area('living room')
lv.prop('tv', 13.6, 4.4, 90)
lv.prop('sofa', 9.3, 3.5, 270)
lv.prop('floor_lamp', 13.5, 1.45)
lv.prop('bookshelf', 10.5, 1.22)
lv.prop('plant', 7.5, 1.5)
lv.prop('armchair', 12.6, 5.9, 215)
lv.prop('table_round', 8.2, 5.6)
lv.paint('floor_hole', 11.9, 5.0, 10)                   # where he kept it
lv.prop('jerrycan', 12.4, 2.6, 40)

lv.area('kitchen')
lv.prop('fridge', 7.42, 8.85, 270)
lv.prop('oven', 7.38, 10.1, 270)
lv.prop('sink', 7.34, 11.55, 270)
lv.prop('table', 11.6, 10.3)
lv.prop('chair', 11.6, 9.45, 90)
lv.prop('chair', 12.65, 10.4, 180)
lv.prop('tube_light', 11.5, 8.07)
lv.prop('trash_can', 13.5, 12.5)

lv.area('entrance hall')
lv.prop('bookshelf', 15.9, 12.78, 180)
lv.prop('ceiling_lamp', 16.0, 10.0)

lv.area('the corridor of the building')
for row in (4.5, 7.5, 10.5, 13.5):                      # a worn carpet runner down its middle
    lv.paint('runner', 19.0, row, 90)
for col in (22.5, 25.5, 28.5, 31.5):
    lv.paint('runner', col, 17.0)
lv.paint('doormat', 18.5, 10.5, 90)                     # his
for (row, lamp) in ((4.5, 6.5), (13.5, 11.8)):          # the neighbours on the east side
    lv.prop('apt_door', 19.91, row, 90)
    lv.paint('doormat', 19.52, row, 90)
    lv.prop('wall_lamp', 19.91, lamp, 90)
lv.paint('newspaper', 19.5, 4.6, 80)
lv.paint('shoes', 19.52, 13.4, 180)
lv.prop('apt_door', 18.09, 5.5, 270)                    # ... and across from them
lv.prop('radiator', 18.09, 7.9, 270)
lv.prop('plant', 18.5, 2.5)
lv.prop('bike', 19.74, 3.0, 90)
lv.prop('extinguisher', 18.09, 14.2, 270)
for col in (22.5, 26.5):                                # along the long corridor: doors on its south wall
    lv.prop('apt_door', col, 17.91, 180)
    lv.paint('doormat', col, 17.52, 180)
lv.paint('newspaper', 26.4, 17.5, 10)
for col in (21.0, 24.5, 28.0):
    lv.prop('wall_lamp', col, 16.09)
lv.prop('radiator', 26.3, 16.09)
lv.prop('bin_bag', 24.3, 17.62, 20)                     # somebody's rubbish, put out for the morning
lv.prop('bin_bag', 24.75, 17.55, 140)
lv.prop('apt_door', 32.5, 17.91, 180)

lv.area('the landing')
lv.paint('stairs', 31.0, 11.75)
lv.prop('ceiling_lamp', 31.0, 14.4)
lv.prop('plant', 33.5, 15.4)
lv.prop('trash_can', 29.45, 15.4)
lv.prop('bin_bag', 29.95, 15.55, 60)

# ---------------------------------------------------------------- the fire, room after room behind him
for (col, row, stage, *delay) in (
        (12.2, 3.1, 1, 0), (12.7, 2.0, 1, 0.3), (9.3, 3.5, 1, 0.4),             # the living room: from where his match
        (13.4, 4.4, 1, 0.2), (8.2, 5.6, 1, 0.5),                                # falls, as he walks in (`spark`)
        (2.2, 2.3, 2), (3.4, 5.6, 3),                                           # his bedroom
        (11.6, 10.3, 3), (9.0, 8.6, 3), (12.8, 12.2, 3),                        # the kitchen, as he reaches the entrance
        (15.9, 12.5, 4), (15.5, 8.6, 4),                                        # the entrance hall
        (17.6, 10.5, 5), (18.4, 7.0, 5), (19.5, 12.6, 5)):                      # his door and the corridor, at the landing
    lv.fire(col, row, stage, *delay)

# ---------------------------------------------------------------- the lesson
lv.tutorial = {
    'stages': [
        {'zone': [1, 1, 5, 5], 'spawn': [4.5, 3.5, 0], 'hints': ['move']},
        {'zone': [7, 1, 13, 6], 'spawn': [5.4, 3.5, 0], 'hints': ['finish', 'takedown'], 'spark': 6,
         'cues': [{'at': [11, 3], 'act': 'light'}],
         'waves': [{'at': [[11, 3]], 'on': 'never', 'blind': True}]},
        {'zone': [7, 8, 13, 12], 'spawn': [10.5, 6.2, 90], 'take': 'bat', 'hints': ['finish', 'take', 'strike', 'punch'],
         'waves': [{'at': [[8, 11]], 'on': 'never', 'blind': True}, {'at': [[16, 10]], 'on': 'kills:1'}]},
        # out of his door, down the corridor: the man at its far end is only pointed at until he turns the corner
        {'zone': [15, 8, 19, 15], 'spawn': [15.5, 10.5, 0], 'marks': {'slide': [19.0, 14.4]}, 'hints': ['slide'],
         'waves': [{'at': [[26, 16]], 'on': 'never', 'blind': True}]},
        {'zone': [18, 16, 28, 17], 'spawn': [18.9, 14.2, 90], 'marks': {'slide': [19.8, 16.5]}, 'take': 'pistol', 'leaves': 2,
         'hints': ['finish', 'take', 'slide'], 'waves': [{'at': [[26, 16]], 'on': 'enter', 'slack': SHOOTER, 'sharp': True}]},
        {'zone': [29, 11, 34, 17], 'spawn': [27.5, 16.5, 0], 'take': 'pistol', 'marks': {'dive': [34.4, 16.5]},
         'hints': ['finish', 'take', 'throw', 'shoot', 'dive'],
         'waves': [{'at': [[30, 12], [32, 12]], 'on': 'pickup:pistol', 'up': STAIRS},
                   {'at': [[31, 11]], 'on': 'kills:2', 'up': STAIRS}]},
    ],
    'fall': [36, 14, 38, 19],
}

lights = [
    [3, 3, 5, '#6a5ad8', 0.3],
    [10, 4, 6, '#7a5ad8', 0.25],
    [26, 16.5, 8, '#5a6ad8', 0.22],
]

if __name__ == '__main__':
    lv.check(guards=7)
    lv.write('tutorial', name='BAD NIGHT', subtitle='SUNSET BAY  -  MARCH 14TH 1986  -  1:05 AM', lights=lights,
             objective=['GET OUT OF THE BUILDING', 'THE WINDOW AT THE END OF THE CORRIDOR'],
             header=[
                 'The tutorial - "BAD NIGHT": his flat set on fire, the corridor of the building, the landing, the window at its end.',
                 'Six places, one move each (src/game/systems/Tutorial.js); he lands in the alley, and level 1 is the next night.',
             ])
