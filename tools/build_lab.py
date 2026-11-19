#!/usr/bin/env python3
"""Builds src/game/data/levels/lab.js (the physics lab / sandbox, ?level=lab) with tools/levelkit.py.

    python tools/build_lab.py

A lit test facility, one station each. A wide concourse runs west to east through the middle; the range closes its
west end, the other stations are bays and rooms opening onto it, a north row and a south row, the street beyond the
south row. Each station's name and number are stencilled on the floor at its entrance (props/label_*), numbered in
reading order: west to east, the north row before the south row. Walls are one tile thick (plaster, `#`).
Plan (north is up, 1 tile = 1 m; columns and rows of the level, a few rows left out; D door, G window, B the barred
window, ~ the curtained doorway, L the locked door; the rows 1-6 bays open on row 7, the rows 12-16 ones on row 11):

              0         1         2         3         4         5         6
              0123456789012345678901234567890123456789012345678901234567890123
         0    XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
         1    X#         #                     #     #      #    X
         3    X# 1 RANGE #    2 EXECUTIONS     #3SOOT# 4POOL#6VIP# 7 wc#7 room X
         4    X#         L                     #     #      #    X
         6    X# fired   #                     #     #      #    X
         7    X#         ##########   ###########D#G###D##B###~##### ####  ###X
         8    X# west                                            X
         9    X#                <=====  the concourse  =====>          7 open  X
        10    X#                                                 X
        11    X#         ##   ###  ##  ##    #####D#####D########X#D#DD#L#DD##X
        12    X#         #8JUK #9TR #10#      #12lobb #13 LIQUIDSX# 14 DOORS  #X
        13    X#         #     #    #  #11 YD #       #          X# front hall#X
        14    X#         ############  #      ##G#G#D##          X#D#D#D#D#D##X
        15    X#         # 10 POWDER corridor #lit rm #          X# back hall #X
        16    X#         #             #      #       #          X#          #X
        17    X##########################    ##############D#####X###D####L###X
        18    X  sidewalk: the trapdoor (west end), the hydrant  X
        21    X  road: 17 VEHICLES (car, van, leaking car)       X
        25    X  the south sidewalk                               X
        26    X#####.########.#########.######XXXXXXXXXXXXXXXXXXXXX
        27    X#24 ARCADE#25 LAUNDRY#  26 ARMS  #
        30    XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

     1 RANGE       the whole west end, fired west: every gun on the firing line (col 8), two rows of ammo boxes behind
                   it; dummies, crates, a barrel, a bolted table and a bookshelf down range against the plaster back
                   wall (bullet holes); a locked door into the executions hall (kick it, shoot it)
     2 EXECUTIONS  ten men facing the north wall, their backs to the lane; a weapon on the floor behind each (knife,
                   bat, tire iron, cue, nothing: fists, 1911, Uzi, M16, SUPER 90, .50 CAL): left click behind one
     3 SOOT        a closed room (a door, a window on the concourse) with two gas bottles: the soot hangs and drifts out
     4 POOL        a man bent over the pool table, its balls to send rolling (a round, a blow, a body into it)
     5 BARS        the pool room's barred window on the concourse
     6 CURTAIN     a velvet curtain in the VIP room's doorway, a man (awake) behind it facing it
     7 TAKEDOWNS   the east wing, a dummy at everything a head can be driven into: a washroom (a toilet, a urinal, a
                   sink), a room (a table, a length of bar, a man with his face to the wall), and one in the open at
                   the concourse's end to take from behind or face to face; a 1911, a knife and a tire iron on the floor
     8 JUKEBOX     a jukebox (E) in a niche, and an arcade cabinet in its attract mode (bump it: it rings)
     9 TRAPDOOR    a trapdoor (E) in a niche, the other one on the sidewalk at the west end
    10 POWDER      an extinguisher on the wall of a dead-end corridor round a corner, a man (awake) at its far end; a
                   silenced Uzi at its mouth: hole it without a sound and walk up to him in the white
    11 STEAM       the yard to the street: a steam pipe to pierce on its wall, a wall vent, a manhole, junk to shove,
                   the one lamp in the lab that is going (flicker 'broken')
    12 POWER       a dim lobby, the fuse box on its wall, a lit room behind its windows (emergency lights over its door)
    13 LIQUIDS     a little bar on tiles: kegs behind the counter, the fire alarm and its sprinklers, a water pipe, two
                   dummies to bleed; the hydrant on the kerb outside, a car in the road whose tank leaks petrol
    14 DOORS       every kind of door (data/doors.js) side by side, off the concourse's east end: in its wall a shop's
                   glass door, the bar's double door, the emergency exit (locked, its lamp and EXIT sign: ring its bell,
                   E, and the man inside comes and turns his key; it shuts behind you, bounces on its closer and locks
                   itself again), the corridor's wired-glass fire doors; between the halls the toilets' swinging doors,
                   staff, the boss's leather, the gaming room's green, a flat's; onto the sidewalk a plain wooden door
                   and a reinforced locked one; a stall's light leaf in the back hall
    15 CUEBALL     level 1's boss (data/bosses.js, entities/Boss.js) in a room of his own beyond the concourse's
                   east end (cols 64-73, rows 7-11, its door at col 63, row 9), AWAKE: his name card and the camera on
                   first sight, his pump-action from the hip, the first hit (wounded, then berserk), the second (his
                   death); crates and a table for cover; a 1911, a bat and a knife on the floor before his door
    16 FIRE        in the soot room (3): petrol poured from its gas bottles to a rug and an armchair; a round through
                   a bottle and the fire runs along the trail, takes what burns, kills who stands in it. LUCKY (his
                   pink scarf, a dummy) stands in the concourse before it
    17 VEHICLES    the street: a car, the van, the leaking car, the boss's convertible (open: nothing to shoot in it
                   until someone sits there), barrels, streetlights
    18 COAT        the concourse's west half, an open lane to run, turn and slide in and watch the runner's coat
                   (src/game/entities/Skirt.js): a low table to vault or slide past, a barrel to turn round
    19 DRIVE       the street's west end: two cars to get into (E at the driver's door) and drive east
                   (systems/Drive.js: W / S, A / D, SPACE the shove toward the mouse's side, the mouse and the left
                   click his gun, R a reload; E again, or stopping, gets him out). In the NORTH lane THE BOSS's
                   convertible, the Uzi on its seat (the grab, as at 22): the heavy car's feel (the nose on its
                   spring, the rear out on the wheel held hard flat out, the body on its springs, the shove), what
                   the speed does to the picture, and its gun ALL ROUND (125 degrees either side of the nose) on three
                   pursuers' black cars (systems/Pursuit.js; each gunman tells his shot every few seconds at whoever
                   comes near, harmlessly): one to his RIGHT in the south lane (across the passenger seat), one to
                   his LEFT up on the sidewalk (out of his door), one dead AHEAD in his lane (over the windscreen):
                   shoot a windscreen (the driver), a front tyre, the gunman, or shove one into the wall. In the
                   south lane a van (a closed car: his hand out of its window, its arc the driver's side and ahead
                   only), the south pursuer and two bins in its way, station 17's barrel, parked van and cars to
                   shove, the end wall to die on nose-on
    20 GETAWAY     the street's east end: THE BOSS's convertible and level 1's way out played here (systems/Outro.js:
                   step into the ring by its driver's door; the level's `exit` is `open`, nothing to clear first): the
                   vault over the door, the key, the wheelspin and the rubber it lays, the tail out round the leaking
                   car, clipping its nose (the ram: shoved, spun, dented, its alarm), down the south lane and black
                   before station 17's van, the hat gone at the first swing;
                   then the results (restart the lab from there)
    21 LORRY       the street's east end, carried on past the facades: a box lorry in its yard, its tail out over the
                   north lane (systems/Lorries.js, prop option `backs`). A car driven near sets it off: it beeps, its
                   lamps flash, the red lane shows where its tail goes, then it backs across both lanes and shuts
                   the street; a while later it goes back in. Nose-on into it is the crash, a scrape is not, a corner
                   clipped is a jolt. A coupe to drive stands before it (E at its door)
    22 GRAB        station 17's convertible (the boss's, the north lane), the Uzi on its passenger seat: E at its
                   driver's door (on the sidewalk) and he sits in, takes the Uzi off the seat, racks it and hangs it
                   over the door (systems/Drive.js grab, CharacterAnim grabPose; the camera pushed in), every time he
                   gets in (getting out puts it back on the seat); then he drives it as at 19
    23 AIM         a room north of CUEBALL's (cols 64-73, rows 1-5), through a doorway in the east wall of the
                   takedowns room (col 63, row 3): the ways of showing the aim to try, above all with a gamepad
                   (data/aim.js, render/AimArt.js; F7 cycles them, OPTIONS / GAME / AIM keeps one). Four dummies at
                   2, 4, 7 and 9 m, one of them behind a wall's end, a crate in the line of the last; a 1911, a
                   SUPER 90, an Uzi and a bat by the door, a box of rounds for each gun. The melee lock (LOCK, the
                   swing turned whole onto the man it holds: systems/Lunge.js): the 2 m man and one more by the bat
                   (a tire iron on him), a step apart; swing from beyond a takedown's reach (blind dummies)
    24 ARCADE      across the street, south row: a customer playing the arcade cabinet (ai/Pastimes.js arcadeAt: the
                   stick, the buttons, the screen in play; a slap and a coin between two games); a shot sends him off
    25 LAUNDRY     next door: a man doing his washing at a top loader (laundryAt: out of the drum, shaken out, folded,
                   laid on the pile on the next lid, the pile to his basket, a look at his watch); he runs at a shot
    26 ARMS        two guards awake, bare-handed (level `arms`, Enemy.armUp): a doorman with his bat stood against
                   the wall at the far end of the room, a brawler (fists only); a knife-man (a blade in his pocket,
                   drawn in a moment). A shot or a noise and the doorman runs for his bat, snatches it up and comes;
                   take the bat first and he comes with his fists
    27 KILL CAM    east of it, same row (cols 34-49): the kill cam (systems/KillCam.js, data/killcam.js; the address
                   picks its version: ?level=lab&killcam=zoom | panel | off). By the door a bat, a SUPER 90 and its
                   box, a knife, a tire iron; in the west half three dummies apart to kill each his own way (the
                   heavy stroke, buckshot at arm's length, floored by a slide or a thrown weapon then finished, or
                   taken from behind); in the east half five in a row, a step apart, for a chain and its end
The guards are passive dummies (they see and hear nothing but go on at their job), except the `awake` ones (the two
sight tests, and CUEBALL).
F1 is open from the start (game/debug/Sandbox.js); T wakes or freezes them all.
"""
from levelkit import Level

W, H = 76, 31                              # (the 12 columns east of col 63 are 15 CUEBALL's room, in the brick)
lv = Level(W, H)

# ---------------------------------------------------------------- tiles
lv.fill(1, 1, 50, 17, '#')                 # plaster inside the brick ring, carved into one-tile walls below
lv.fill(51, 1, 62, 10, '#')                # ... and the east wing (7 TAKEDOWNS), north of the concourse's end
# 1 RANGE: the whole west end, its plaster back wall on col 1, open on the concourse
lv.fill(2, 1, 10, 16, '_')
lv.fill(11, 8, 11, 10, '_')
lv.put(11, 4, 'L')                         # a locked door into the executions hall
# the concourse
lv.fill(12, 8, 62, 10, '_')
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
lv.fill(52, 1, 55, 6, '+')                 # 7 TAKEDOWNS: a washroom on tiles ...
lv.put(54, 7, '+')
lv.fill(57, 1, 62, 6, '.')                 # ... and a room with a table and a length of bar; the open one stands
lv.fill(59, 7, 60, 7, '.')                 # in the concourse's end
# south row
lv.fill(12, 12, 16, 13, '.')               # 8 JUKEBOX: a niche
lv.fill(13, 11, 15, 11, '.')
lv.fill(18, 12, 21, 13, '_')               # 9 TRAPDOOR: a niche
lv.fill(19, 11, 20, 11, '_')
lv.fill(23, 11, 24, 16, '+')               # 10 POWDER: the mouth, then the corridor west along rows 15-16
lv.fill(12, 15, 22, 16, '+')
lv.fill(26, 12, 31, 16, '_')               # 11 STEAM: the yard, open on the concourse and the sidewalk
lv.fill(27, 11, 30, 11, '_')
lv.fill(27, 17, 30, 17, '_')
lv.fill(33, 12, 39, 13, ';')               # 12 POWER: the lobby ...
lv.put(36, 11, 'D')
lv.fill(33, 15, 39, 16, '.')               # ... and the lit room behind its windows
for x in (34, 36):
    lv.put(x, 14, 'G')
lv.put(38, 14, 'D')
lv.fill(41, 12, 50, 16, '+')               # 13 LIQUIDS: a little bar on tiles, doors on the concourse and the sidewalk
lv.put(42, 11, 'D')
lv.put(45, 17, 'D')
lv.fill(51, 11, 62, 17, '#')               # 14 DOORS: every kind of door side by side, two halls behind two walls
lv.fill(52, 12, 61, 13, '.')               # the front hall, off the concourse's south wall ...
lv.fill(52, 15, 61, 16, '.')               # ... the back hall behind it
lv.put(52, 11, 'D')                        # in the concourse's wall: a shop's glass door, the bar's double door,
lv.fill(54, 11, 55, 11, 'D')               # the emergency exit (locked, its bell), the corridor's double fire door
lv.put(57, 11, 'L')
lv.fill(59, 11, 60, 11, 'D')
for x in (52, 54, 56, 58, 60):             # between the halls: the swinging doors, staff, the boss's, the gaming
    lv.put(x, 14, 'D')                     # room's, a flat's
lv.put(54, 17, 'D')                        # onto the sidewalk: the plain wooden door, a reinforced locked one
lv.put(59, 17, 'L')
for (x, y), kind in (((52, 11), 'shop'), ((54, 11), 'bar'), ((59, 11), 'wired'), ((52, 14), 'swing'),
                     ((54, 14), 'staff'), ((56, 14), 'office'), ((58, 14), 'gaming'), ((60, 14), 'flat'),
                     ((54, 17), 'wood'), ((59, 17), 'reinforced')):
    lv.door(x, y, kind=kind)
lv.door(57, 11, kind='fire', inside='s', relock=4)
lv.fill(64, 6, 74, 12, '#')                # 15 CUEBALL: his room beyond the concourse's east end, behind a door
lv.fill(64, 7, 73, 11, ';')
lv.put(63, 9, 'D')
lv.fill(63, 1, 74, 5, '#')                 # 23 AIM: a room north of his, off the takedowns room
lv.fill(64, 1, 73, 5, '_')
lv.put(63, 3, '_')
lv.fill(70, 1, 70, 2, '#')                 # a wall's end, a man behind it
# the street
lv.fill(1, 18, 62, 19, 's')
lv.fill(1, 20, 62, 24, '=')
lv.fill(1, 22, 62, 22, '-')
# the south side of the street: its sidewalk and three rooms off it (24 ARCADE, 25 LAUNDRY, 26 ARMS)
lv.fill(1, 25, 32, 25, 's')
lv.fill(1, 26, 32, 29, '#')
lv.fill(2, 27, 8, 29, '.')
lv.put(5, 26, '.')
lv.fill(10, 27, 15, 29, '+')
lv.put(14, 26, '+')
lv.fill(17, 27, 31, 29, '.')
lv.put(24, 26, '.')
lv.fill(33, 25, 50, 25, 's')               # 27 KILL CAM: the sidewalk goes on east, one more room off it
lv.fill(33, 26, 50, 29, '#')
lv.fill(34, 27, 49, 29, '.')
lv.put(41, 26, '.')

# ---------------------------------------------------------------- actors (30 guards)
lv.actor('@', 27, 9, face=270)

lv.area('the concourse')
for x in (14.5, 20.5, 26.5, 32.5, 39.5, 46.5, 53.5, 59.5):
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
# 16 FIRE, in the same room: petrol poured from the bottles to a rug and an armchair. Blow a bottle (a round through
# it) and the petrol catches, runs along its trail, takes the rug and the chair, and kills who stands in it
# (src/game/systems/FireSpread.js). LUCKY, the prologue's man with the match, watches from the concourse.
lv.paint('label_fire', 36.0, 9.25)
lv.paint('rug', 36.2, 5.3)
lv.prop('armchair', 37.9, 5.7, 200)
lv.pour(14, (35.9, 3.3))
lv.pour(10, (35.9, 3.3), (35.3, 4.4), (36.0, 5.2), (37.5, 5.5))
lv.pour(10, (36.0, 5.2), (34.6, 6.3))
lv.actor('j', 38, 9, face=180, look='lucky')

# 18 COAT: the concourse itself is the lane (run it end to end, weave, slide): the skirt of the runner's duster
# trails, swings wide in a turn, opens with his speed and hangs as a short hem when he stops (entities/Skirt.js)
lv.paint('label_coat', 16.0, 9.0)
lv.prop('table', 25.5, 9.5, 90)
lv.prop('barrel', 30.5, 8.9)

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

lv.area('7 takedowns')
# every context of a takedown (data/finishers.js TAKEDOWNS, systems/TakedownSpot.js): a dummy right at each thing a
# head can be driven into, one in the open to take from behind or face to face, and what to take them with (a hand
# free: fists, the 1911, the knife, the tire iron). The first three stand off their tile's centre: at arm's length.
lv.paint('label_takedowns', 56.5, 8.35)
lv.prop('toilet', 53.5, 1.4)                                 # the washroom: a toilet on the north wall ...
lv.actor('m', 53, 2, face=270, at=(53.5, 2.45))
lv.prop('urinal', 52.19, 4.5, 270)                           # ... a urinal on the west one ...
lv.actor('j', 52, 4, face=180, at=(52.95, 4.5))
lv.prop('sink', 55.7, 3.5, 90)                               # ... a sink on the east one
lv.actor('i', 54, 3, face=0, at=(54.75, 3.5))
lv.prop('tube_light', 53.5, 6.93, 180)
lv.prop('table', 58.5, 1.6)                                  # the room: a table ...
lv.actor('b', 58, 2, face=270, at=(58.5, 2.6))
for x in (60.5, 61.5):
    lv.prop('bar_counter', x, 1.5)                           # ... a length of bar ...
lv.actor('k', 61, 2, face=270, at=(61.0, 2.4))
lv.actor('p', 57, 5, face=180)                               # ... a man with his face to the wall
lv.prop('ceiling_lamp', 60.0, 4.2)
lv.actor('u', 59, 9, face=0)                                 # in the open: from behind, or face to face
for x, kind in ((55.5, 'pistol'), (56.3, 'knife'), (57.1, 'tire_iron')):
    lv.drop(kind, x, 9.7, 0)

lv.area('8 jukebox')
lv.paint('label_jukebox', 14.5, 10.65)
lv.prop('jukebox', 14.5, 13.64, 180)
lv.prop('arcade', 16.5, 12.4, 90)                            # its screen plays by itself (render/PropLife.js)
lv.prop('chair', 12.6, 12.6, 20)
lv.prop('wall_lamp', 16.0, 13.92, 180)

lv.area('9 trapdoor')
lv.paint('label_trapdoor', 20.0, 10.65)
lv.prop('wall_lamp', 18.6, 13.92, 180)

lv.area('10 powder')
lv.paint('label_powder', 24.3, 10.65)
lv.drop('uzi_silenced', 23.6, 12.4, 0)     # hole it without a sound: he would come to a shot
lv.actor('z', 24, 12)
lv.prop('extinguisher', 20.5, 15.14, 0)
lv.actor('j', 12, 15, face=0, job='hall', awake=True)    # sees down the corridor, not round its corner
lv.prop('wall_lamp', 15.5, 15.08, 0)
lv.prop('wall_lamp', 24.92, 13.5, 90)

lv.area('11 steam: the yard, junk to shove')
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

lv.area('12 power: the lobby and the lit room')
lv.paint('label_power', 36.0, 10.65)
lv.power(33, 15, 39, 16, 37.5, 13.92, 180)  # the fuse box in the lobby, between the windows and the door
lv.prop('emergency_light', 37.4, 15.08, 0)
lv.prop('emergency_light', 33.08, 15.5, 270)
for x in (34.5, 37.5):
    lv.prop('ceiling_lamp', x, 16.0)
lv.prop('wall_lamp', 39.92, 15.6, 90)
lv.prop('table', 35.5, 16.35)
lv.prop('chair', 34.4, 16.35, 0)

lv.area('13 liquids')
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

lv.area('14 doors')
# the doors (src/game/data/doors.js): their weight when walked into, kicked, shot; the closer
# swings its door back shut and latches it; the locked one's lamp is red. Ring its bell (E): the man inside comes,
# turns his key (the lamp amber, then green) and goes back; walk in, the closer shuts it behind you and it locks
# itself again a few seconds later (red)
lv.paint('label_doors', 55.0, 10.65)
lv.leaf(61.9, 15.5, 180, 24)                                 # a toilet stall's light leaf on the back hall's east wall
lv.actor('m', 57, 13, face=270)                              # the man with the emergency exit's key, at his post
lv.buzzer(58.4, 10.75, door=(57, 11), guard=(57, 13))        # the bell by it
for x in (53.0, 56.5, 60.0):
    lv.prop('ceiling_lamp', x, 12.6)
    lv.prop('ceiling_lamp', x, 15.6)

lv.area('15 cueball')
# level 1's boss, awake (he fights: his card, his pump-action, the two hits), in a room behind a door so that he is
# met when one chooses; what to hit him with on the floor before it
lv.paint('label_cueball', 60.8, 8.35)
lv.actor('h', 72, 9, face=180, look='cueball', awake=True)
lv.prop('table', 67.5, 9.6)                                  # he tips it over or walks through what is in his way
for x, y in ((65.6, 7.7), (70.2, 7.7), (65.6, 10.8)):
    lv.prop('crate', x, y)                                   # cover from his buckshot
lv.prop('armchair', 72.9, 10.8, 180)
lv.prop('ceiling_lamp', 68.5, 9.0)
lv.prop('wall_lamp', 68.5, 7.08, 0)
for x, kind in ((61.3, 'pistol'), (61.9, 'bat'), (62.5, 'knife')):
    lv.drop(kind, x, 9.9, 0)

lv.area('23 aim')
# the aim's cue (src/game/data/aim.js): men at four distances, one behind a wall's end, a crate before the last; a
# thin gun, a wide one, a fast one and a blade to see what each concept tells of them
lv.paint('label_aim', 61.6, 3.6)
for (x, y), kind in (((64.6, 1.5), 'pistol'), ((65.4, 1.5), 'shotgun'), ((64.6, 2.2), 'uzi'), ((65.4, 2.2), 'bat')):
    lv.drop(kind, x, y, 0)
lv.actor('n', 64, 5)
lv.actor('g', 65, 5)
lv.actor('m', 67, 2, face=180)             # 2 m from the door
lv.actor('i', 66, 1, face=180)             # by the bat: the melee lock, with the 2 m man
lv.actor('k', 69, 5, face=180)             # 4 m
lv.actor('j', 72, 1, face=180)             # 7 m, behind the wall's end
lv.actor('b', 73, 4, face=180)             # 9 m, a crate in the line
lv.prop('crate', 71.3, 4.5, 8)
lv.prop('ceiling_lamp', 66.5, 3.5)
lv.prop('ceiling_lamp', 71.5, 3.5)
lv.prop('wall_lamp', 68.5, 5.92, 180)

lv.area('17 vehicles: the street, to ram, hole and blow up')
lv.paint('label_vehicles', 28.5, 18.6)
lv.passage(('trapdoor', 20.0, 12.9, 0), ('trapdoor', 2.5, 18.6, 0))
lv.prop('car', 30.0, 21.1, 0)              # (east of station 19's cars: the north lane's west end is theirs)
lv.prop('van', 24.0, 23.5, 180)
lv.prop('car2', 47.2, 21.1, 0)             # its tank (the rear, west end) by the hydrant: the petrol runs with the water
# the boss's, roof down: to hole, burn and blow up (its hat stays on the seat); 22 GRAB: E at its driver's door (north)
# and he takes the Uzi off its passenger seat, every time (systems/Drive.js grab), then drives it
lv.prop('convertible', 38.6, 20.9, 0, drive=True)
lv.paint('label_grab', 34.6, 18.6)
lv.prop('barrel', 16.6, 23.4)
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

lv.area('19 drive: the convertible and a van to get into and drive down the street, three pursuers to shoot all round')
lv.paint('label_drive', 8.2, 18.6)
lv.prop('convertible', 4.7, 21.0, 0, drive=True)  # the north lane: E at its driver's door (on the sidewalk)
lv.prop('van', 4.6, 23.5, 0, drive=True)   # the south lane: E at its driver's door (its north side)
lv.prop('trash_can', 18.4, 23.9)
lv.prop('trash_can', 19.2, 23.0)
lv.prop('pursuer', 12.6, 23.55, 0, pursuer=True)  # to the convertible's RIGHT (the van's first thing to shove)
lv.prop('pursuer', 14.2, 19.02, 0, pursuer=True)  # to its LEFT, up on the sidewalk
lv.prop('pursuer', 22.0, 21.1, 0, pursuer=True)   # dead AHEAD in its lane, its gunman telling his shot

lv.area('21 lorry: a box lorry that backs out across the street when a car comes')
lv.fill(63, 18, 72, 19, 's')               # the street carried on east past the facades, the lorry's yard north of it
lv.fill(63, 20, 72, 24, '=')
lv.fill(63, 22, 72, 22, '-')
lv.fill(66, 13, 69, 17, '_')
lv.paint('label_lorry', 64.6, 18.6)
lv.prop('lorry', 68.0, 17.375, -90, backs=3)       # its cab to the north, its tail over the north lane
lv.prop('car2', 61.0, 23.6, 0, drive=True)         # E at its driver's door
lv.prop('trash_can', 64.5, 19.4)
lv.prop('crate', 70.9, 19.3, 12)
lv.prop('wall_lamp', 64.5, 18.08, 0)

lv.area('20 getaway: the convertible and the way out of level 1, played in the street')
lv.paint('label_getaway', 57.0, 18.6)
lv.prop('convertible', 56.6, 21.0, 180, lights=False)   # its driver's door on the road's side
# into the south lane clipping the leaking car's nose on the way (the getaway's ram: shoved, spun, dented; level 1
# clips the coupe by its alley's mouth), then down the lane: the picture is black before station 17's van
exit_zone = {'x': 56.6, 'y': 22.9, 'r': 1.2, 'open': True, 'route': [[52.0, 21.0], [48.0, 23.0], [30.0, 23.0]], 'radius': [3, 3],
             'slide': [1, 0.5], 'fade': 13}

lv.area('24 arcade: a customer at the cabinet')
lv.paint('label_arcade', 5.0, 25.5)
lv.prop('arcade', 6.5, 27.47, 0)                         # its back to the north wall, its player off the doorway
lv.patron('civ3', 6.5, 28.12, 270, 'arcade')
lv.prop('jukebox', 2.6, 28.4, 90)
lv.prop('ceiling_lamp', 5.0, 28.2)
lv.prop('wall_lamp', 8.92, 28.5, 90)

lv.area('25 laundry: a man doing his washing')
lv.paint('label_laundry', 12.5, 25.5)
for x in (10.6, 11.32, 12.04):
    lv.prop('washer', x, 29.6, 180)
lv.patron('civ6', 12.04, 28.88, 90, 'laundry')
lv.prop('laundry_basket', 12.85, 29.45, 6)
lv.prop('bench', 13.0, 27.4)
lv.prop('tube_light', 12.5, 29.93, 180)

lv.area('26 arms: bare-handed guards, a bat against the wall')
lv.paint('label_arms', 24.0, 25.5)
lv.actor('b', 20, 28, face=0, job='door', awake=True, arms=(30.85, 27.6))   # his bat at the room's far end
lv.lean('bat', 30.85, 27.6, 0)
lv.actor('k', 22, 27, face=90, awake=True, arms='fists')                   # a brawler
lv.actor('j', 18, 28, face=0, awake=True)                                  # a blade in his pocket
lv.prop('table', 26.5, 28.2)
lv.prop('chair', 25.4, 28.2, 0)
for x in (20.0, 27.0):
    lv.prop('ceiling_lamp', x, 28.0)

lv.area('27 kill cam: men to kill each his own way, five in a row for a chain')
lv.paint('label_killcam', 41.5, 25.5)
for x, kind in ((40.0, 'bat'), (40.7, 'knife'), (42.6, 'shotgun'), (43.3, 'tire_iron')):
    lv.drop(kind, x, 27.5, 90)
lv.actor('g', 43, 28)                      # the shotgun's box
lv.actor('k', 35, 27, face=0)              # the west half: three apart
lv.actor('b', 37, 29, face=180)            # (his back to the door: a takedown)
lv.actor('j', 38, 27, face=90)
for x in range(45, 50):
    lv.actor('k', x, 28, face=180)         # the east half: five in a row, a step apart
for x in (37.0, 46.5):
    lv.prop('ceiling_lamp', x, 28.5)

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
    lv.check(guards=44)
    lv.write('lab', name='PHYSICS LAB', subtitle='SANDBOX  -  A STATION FOR EVERY SYSTEM', passive=True, lights=lights, light=light,
             exit=exit_zone, ambient={'traffic': [], 'walkers': []},
             header=[
                 'Physics lab: a test facility, a concourse with a station on each side (range, executions, soot, pool, bars,',
                 'curtain, takedowns, jukebox, trapdoor, powder, steam, power, liquids, doors, CUEBALL, fire, the coat\'s lane, the aim\'s room) and a',
                 'street with the vehicles. Load with ?level=lab.',
                 'Guards here are passive dummies (blind and deaf, at their job), but those kept `awake`: the two of the sight',
                 'tests, and CUEBALL in his room (level 1\'s boss: he fights).',
             ])
