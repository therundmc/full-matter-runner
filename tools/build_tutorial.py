"""Build src/game/data/levels/tutorial.js: the tutorial, the night his flat burned.

    python3 tools/build_tutorial.py

He ran packages for the bar's boss for six years and kept every dollar under his floor, to leave town. Tonight the
boss closes the account: his men take the money back and burn the place with him in it (the opening tells it:
src/game/ui/Cinematic.js). He wakes on his mattress, his bags packed, and has to get out: the flat on fire, the
corridor of the building with the neighbours' doors, the landing where more of them come up the stairs, the window
at the corridor's end, on the alley.

How it is staged (src/game/systems/Tutorial.js, src/game/data/staging.js):

    the opening     his eye opens, the camera very close. Through the doorway, at the far end of the trail of petrol
                    that runs from his mattress across the living room, the man who poured it: he turns, laughs,
                    strikes a match, lets it fall and is gone by the front door, which he slams. Nothing stops him.
                    The fire runs along the trail (src/game/systems/FireSpread.js) and he may get up.
    bedroom         move: out by the half of the doorway the trail leaves free
    living room     the fire kills: the trail along the north wall, the sofa, the rug; out by the kitchen door
    kitchen         a man turning it over for the money, his back to the door ('rummage'): get behind him, break his
                    neck; the lookout smoking in the back hall ('hall') comes in when he is dead: a punch floors him,
                    finish him; a bat lies by the table. The fire is kept out a moment, then comes in under the door.
    back hall,      out by the back door: the fire comes down the corridor's carpet from his front door; at the
    the corridor    corridor's far end a man waits, his pistol out, his eyes on the corner ('lookout'): run and slide
                    under his fire. The gun he drops has two rounds left in it.
    the landing     three of them come up the stairs, heard before they are seen (`up`): shoot, throw the empty gun,
                    finish the man it floored
    the window      at the corridor's end: the last stretch, and the stove goes up in the kitchen behind him, through
                    the wall; dive. He lands in the alley in a roll, and level 1 is the next night.

Each lesson slows time the first time it is said. The guards of a place sleep until its turn, a retry starts again at
the last place reached with the fire where it would be.
"""
from levelkit import Level

W, H = 29, 22            # the building, and the roofs next door east of it (room for the camera)
lv = Level(W, H)
SHOOTER = 0.35           # the corridor's gunman fires as he comes round the corner: the shot is what he slides under
STAIRS = [8.0, 20.65]    # where the men coming up the stairs step onto the landing

# ---------------------------------------------------------------- tiles
lv.fill(4, 1, 22, 20, '#')            # the building: plaster inside, brick round it
lv.fill(4, 1, 8, 5, ';')              # his bedroom
lv.put(6, 0, 'G')                     # its window on the street
lv.fill(9, 2, 9, 3, ';')              # its doorway: no door left in it, two tiles wide
lv.fill(10, 1, 16, 6, '.')            # living room: bare boards
lv.put(17, 2, '.')                    # an open doorway
lv.fill(18, 1, 19, 3, ':')            # the entrance hall
lv.put(20, 2, 'D')                    # his front door
lv.put(13, 7, 'D')
lv.fill(10, 8, 16, 12, '+')           # kitchen
lv.put(17, 10, 'D')
lv.fill(18, 9, 19, 11, '.')           # the back hall
lv.put(20, 10, 'D')                   # the back door
lv.fill(21, 2, 22, 15, ',')           # the building's corridor, north to south ...
lv.fill(4, 14, 20, 15, ',')           # ... then west to its window, under his kitchen
lv.fill(6, 16, 10, 20, '_')           # the landing, open on the corridor; the stairs go down from its south side
for row in (14, 15):
    lv.put(3, row, 'G')               # the window at the corridor's end
    lv.put(11, row, 'D')              # the fire door across the corridor, between the landing and his end of it
lv.door(20, 2, kind='flat', closer=True)   # his front door: a cheap flat's, its number, its chain, on a closer
lv.door(20, 10, kind='flat')               # his back door onto the building's corridor
lv.door(11, 14, kind='wired')              # the fire doors: wired glass, they swing back shut behind whoever goes through
lv.fill(0, 12, 2, 17, '=')            # the night outside, two floors over the alley

# ---------------------------------------------------------------- actors (7 men)
lv.actor('@', 4, 2, face=0)                             # on his mattress
lv.actor('j', 18, 2, face=90, job='arson')              # the petrol poured, the matchbox in his hand
lv.actor('j', 11, 11, face=90, job='rummage')           # at the kitchen worktop, turning the drawers out
lv.actor('m', 19, 10, face=0, job='hall')               # at the back door, smoking: comes when the first one is dead
lv.actor('p', 14, 14, face=0, job='lookout')            # down the corridor, a pistol, his eyes on the corner
lv.actor('j', 7, 19, face=270)                          # coming up the stairs when he takes the gun
lv.actor('m', 9, 19, face=270)
lv.actor('k', 8, 20, face=270)                          # and a third when those two are dead
lv.drop('bat', 12.5, 10.7, 25)

lv.guard(0, 0, W - 1, H - 1)                            # nobody is a guest here

# ---------------------------------------------------------------- props
lv.area('his bedroom: a mattress on the floor, his bags packed')
lv.paint('bed', 4.8, 2.4)                               # the mattress he wakes on (no body: he lies on it)
lv.prop('table_lamp', 4.45, 4.0)
lv.prop('crate', 8.45, 5.4, 8)                          # what he was taking with him
lv.prop('crate', 7.75, 5.5, 350)
lv.prop('crate', 8.2, 4.75, 20)
lv.prop('bin_bag', 4.45, 5.5, 30)
lv.prop('chair', 8.4, 1.5, 200)
lv.prop('poster_band', 7.6, 1.09)
lv.prop('frame_photo', 4.09, 4.6, 270)
lv.paint('shoes', 6.2, 4.9, 250)
lv.paint('newspaper', 6.9, 3.9, 30)

lv.area('living room: the floor torn up where he kept it')
lv.prop('sofa', 12.5, 1.5)
lv.prop('bookshelf', 15.3, 1.22)
lv.prop('plant', 10.5, 1.5)
lv.paint('rug', 12.5, 3.2)
lv.prop('tv', 16.55, 4.2, 90)
lv.prop('armchair', 15.3, 5.5, 215)
lv.prop('floor_lamp', 10.45, 6.5)
lv.prop('table_round', 11.2, 4.4, clutter='flat_table')
lv.paint('floor_hole', 12.9, 4.9, 10)                   # where he kept it
lv.prop('jerrycan', 16.4, 3.1, 40)                      # put down when it was empty
lv.prop('poster_fight', 11.4, 6.91, 180)
lv.prop('frame_photo', 14.0, 1.09)
lv.paint('newspaper', 14.3, 5.9, 70)
lv.litter('bill', 12.9, 4.9, 12, 34, 7, looks=(5, 3, 2), seed=1986)   # the few they dropped

lv.area('kitchen')
lv.prop('fridge', 10.45, 12.65, 180)
lv.prop('sink', 11.75, 12.7, 180, clutter='flat_sink')
lv.prop('oven', 14.6, 12.68, 180)
lv.prop('gas_bottle', 15.5, 12.7)                       # the stove's: the two of them go at the end
lv.prop('table', 14.4, 10.3, clutter='flat_kitchen')
lv.prop('chair', 14.4, 9.5, 90)
lv.prop('chair', 13.4, 10.35, 0)
lv.prop('tube_light', 11.5, 8.07, flicker='stutter')
lv.prop('trash_can', 16.45, 12.45, tips=False)          # indoors: stays up
lv.prop('bin_bag', 16.5, 11.75, 60)
lv.prop('jerrycan', 12.7, 8.5, 200)

lv.area('entrance hall')
lv.prop('coat_hooks', 18.6, 3.91, 180)
lv.prop('ceiling_lamp', 19.0, 2.5)
lv.paint('doormat', 19.5, 2.5, 90)

lv.area('back hall')
lv.prop('bookshelf', 18.9, 11.78, 180)
lv.prop('ceiling_lamp', 19.0, 10.0)
lv.paint('shoes', 18.4, 9.4, 100)

lv.area('the corridor of the building')
for row in (4.5, 7.5, 10.5, 13.5):                      # a worn carpet runner down its middle ...
    lv.paint('runner', 22.0, row, 90)
for col in (20.5, 17.5, 14.5, 11.5):                    # ... and on along the long corridor
    lv.paint('runner', col, 15.0)
lv.paint('doormat', 21.5, 10.5, 90)                     # his
lv.paint('doormat', 21.5, 2.5, 90)
for (row, lamp) in ((5.5, 7.5), (12.0, 9.5)):           # the neighbours on the east side
    lv.prop('apt_door', 22.91, row, 90)
    lv.prop('wall_lamp', 22.91, lamp, 90)
lv.paint('newspaper', 22.5, 5.6, 80)
lv.prop('apt_door', 21.09, 6.5, 270)                    # ... and across from them
lv.prop('radiator', 21.09, 8.4, 270)
lv.prop('extinguisher', 21.09, 12.4, 270)
lv.prop('bike', 21.26, 4.3, 90)
lv.prop('plant', 22.5, 2.5)
for col in (13.5, 17.5):                                # along the long corridor: doors on its south wall
    lv.prop('apt_door', col, 15.91, 180)
    lv.paint('doormat', col, 15.52, 180)
lv.paint('newspaper', 17.4, 15.5, 10)
lv.paint('shoes', 13.1, 15.5, 180)
lv.prop('wall_lamp', 19.5, 14.09)
lv.prop('wall_lamp', 11.5, 15.91, 180)
lv.prop('tube_light', 17.0, 14.07, flicker='dying')     # a tube on its last legs
lv.prop('radiator', 18.2, 14.09)
lv.prop('poster_band', 20.0, 15.91, 180)
lv.prop('bin_bag', 15.6, 15.62, 20)                     # somebody's rubbish, put out for the morning
lv.prop('bin_bag', 16.05, 15.55, 140)
lv.prop('wall_lamp', 5.0, 14.09)

lv.area('the alley under the window')
lv.prop('streetlight', 0.6, 13.0)

lv.area('the landing')
lv.paint('stairs', 8.0, 20.25, 180)
lv.prop('ceiling_lamp', 8.0, 17.6)
lv.prop('plant', 6.5, 16.6)
lv.prop('trash_can', 10.5, 16.6, tips=False)
lv.prop('bin_bag', 10.05, 16.5, 60)
lv.prop('pay_phone', 6.09, 18.4, 270)

# ---------------------------------------------------------------- the petrol (src/game/systems/FireSpread.js)
# From his mattress to the man with the match: along the north side of the living room, through the north half of the
# bedroom's doorway. The south half is the way out.
lv.pour(14, (17.6, 2.35))                               # where the match falls
lv.pour(10, (17.6, 2.3), (16.0, 2.2), (9.5, 2.2), (6.9, 2.2))
lv.pour(12, (6.7, 2.0))                                 # short of the mattress: the carpet does the rest
# round the living room's east side to the kitchen door, kept from catching at the door until he is through it
lv.pour(10, (16.0, 2.2), (16.05, 5.6), (14.9, 6.45))
lv.pour(10, (14.9, 6.45), (13.5, 6.55), (13.5, 8.35))
# the kitchen: along its north wall, down its west one to the fridge, a splash to the table
lv.pour(10, (13.5, 8.35), (10.45, 8.35), (10.4, 11.3))
lv.pour(10, (13.5, 8.35), (16.4, 8.35))
lv.pour(10, (13.6, 8.35), (14.3, 9.5))
# the entrance hall: along its north wall, under the front door, onto the corridor's carpet
lv.pour(10, (17.6, 2.3), (18.0, 1.3), (19.8, 1.3), (19.8, 2.15), (21.4, 2.2), (22.0, 3.0), (22.0, 5.0))

# ---------------------------------------------------------------- the wear of the place (render/FloorWear.js)
lv.grime('stain', 4, 1, 8, 5, 2)                        # the bedroom carpet
lv.grime('burns', 4, 3, 8, 5, 2)
lv.grime('butts', 6, 3, 8, 5, 3)
lv.grime('rings', 10, 3, 12, 5, 4)                      # round the low table: takeaways, bottles
lv.grime('sticky', 10, 3, 13, 6, 2)
lv.grime('napkin', 10, 3, 14, 6, 4)
lv.grime('butts', 10, 1, 16, 6, 5)
lv.grime('stain', 13, 1, 16, 6, 2, col='#3a2418')
lv.grime('sticky', 10, 8, 16, 12, 3)                    # the kitchen floor
lv.grime('stain', 10, 10, 13, 12, 3, col='#5a5a3a')
lv.grime('napkin', 13, 9, 16, 12, 3)
lv.grime('butts', 18, 9, 19, 11, 3)                     # the lookout's
lv.grime('stain', 21, 2, 22, 13, 4, col='#3a3020')      # the corridor: years of it
lv.grime('butts', 21, 2, 22, 13, 4)
lv.grime('sticky', 21, 8, 22, 13, 2)
lv.grime('stain', 4, 14, 20, 15, 6, col='#3a3020')
lv.grime('butts', 11, 14, 20, 15, 6)                    # the man who waits there smokes
lv.grime('napkin', 4, 14, 20, 15, 3)
lv.grime('butts', 6, 16, 10, 20, 4)
lv.grime('stain', 6, 16, 10, 20, 3)
lv.wear_path(6.2, 3.3, 9.5, 3.5, 10)                    # from his mattress to the kitchen
lv.wear_path(9.5, 3.5, 13.5, 6.6, 10)
lv.wear_path(13.5, 8.6, 16.6, 10.5, 10)
lv.wear_path(21.5, 3.0, 21.5, 13.5, 12)                 # the corridor's lino, either side of the runner
lv.wear_path(20.5, 14.5, 4.8, 14.5, 12)
lv.wear_path(8.0, 16.2, 8.0, 19.4, 14)

# ---------------------------------------------------------------- the lesson
lv.tutorial = {
    'stages': [
        {'zone': [4, 1, 8, 5], 'spawn': [4.5, 2.5, 0], 'cam': 'bedroom', 'hints': ['move'],
         'waves': [{'at': [[18, 2]], 'on': 'never', 'blind': True}]},     # the man with the match (the opening)
        {'zone': [9, 1, 16, 6], 'spawn': [10.6, 4.6, 0], 'cam': 'flat', 'marks': {'flee': [13.5, 6.9]}, 'hints': ['flee']},
        {'zone': [10, 8, 16, 12], 'spawn': [12.4, 9.7, 90], 'cam': 'flat', 'hold': 18, 'keep': [[13, 6, 14, 7]], 'take': 'bat',
         'hints': ['finish', 'takedown', 'punch', 'strike', 'take'],
         'waves': [{'at': [[11, 11]], 'on': 'never', 'blind': True}, {'at': [[19, 10]], 'on': 'kills:1'}]},
        # out of the back door, down the corridor: the man at its far end is only pointed at until he turns the corner
        {'zone': [18, 9, 22, 13], 'spawn': [18.6, 10.5, 0], 'cam': 'corridor', 'hold': 3, 'keep': [[21, 3, 22, 8]],
         'marks': {'slide': [21.5, 13.0]}, 'hints': ['slide'], 'waves': [{'at': [[14, 14]], 'on': 'never', 'blind': True}]},
        {'zone': [13, 14, 22, 15], 'spawn': [21.5, 12.6, 90], 'cam': 'corridor', 'hold': 6, 'marks': {'slide': [20.3, 14.5]},
         'take': 'pistol', 'leaves': 2, 'hints': ['finish', 'take', 'slide'],
         'waves': [{'at': [[14, 14]], 'on': 'enter', 'slack': SHOOTER, 'sharp': True}]},
        {'zone': [4, 14, 12, 20], 'spawn': [12.5, 14.5, 180], 'cam': 'landing', 'hold': 8, 'take': 'pistol',
         'marks': {'dive': [4.6, 15.0]}, 'hints': ['finish', 'take', 'throw', 'shoot', 'dive'],
         'waves': [{'at': [[7, 19], [9, 19]], 'on': 'pickup:pistol', 'up': STAIRS},
                   {'at': [[8, 20]], 'on': 'kills:2', 'up': STAIRS}]},
    ],
    # the man with the match: where he stands, where it falls, the door he slams behind him, where he runs to
    'opening': {'man': [18, 2], 'match': [17.6, 2.35], 'door': [20, 2], 'out': [21.6, 2.5]},
    # the end: the last stretch of the corridor, the stove behind the wall, where the fire comes out
    'blast': {'zone': [4, 14, 8, 15], 'at': [14.6, 12.68], 'breach': [14.6, 14.3]},
    'fall': [0, 12, 2, 17],
}

lights = [
    [1.5, 14.5, 5, '#ffb46a', 0.5],                     # the alley under the window: a streetlight's glow
    [6, 3, 5, '#6a5ad8', 0.3],
    [13, 4, 6, '#7a5ad8', 0.25],
    [12, 14.5, 8, '#5a6ad8', 0.22],
]

if __name__ == '__main__':
    lv.check(guards=7)
    lv.write('tutorial', name='BAD NIGHT', subtitle='SUNSET BAY  -  MARCH 14TH 1986  -  1:05 AM', lights=lights,
             objective=['GET OUT OF THE BUILDING', 'THE WINDOW AT THE END OF THE CORRIDOR'],
             header=[
                 'The tutorial - "BAD NIGHT": his flat set on fire, the corridor of the building, the landing, the window at its end.',
                 'Six places, one move each (src/game/systems/Tutorial.js, staged by src/game/data/staging.js); he lands in the',
                 'alley, and level 1 is the next night.',
             ])
