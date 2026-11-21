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
        27    X#24 ARCADE#25 LAUNDRY#  26 ARMS  ##   27 THROW   #
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
                   (systems/Drive.js: the car runs at its cruise speed by itself, no throttle and no brake; W / S,
                   or A / D, steer it up / down the picture; SPACE the shove, a lunge of a lane toward the side he
                   aims at; the mouse and the left click his gun, which never runs dry at the wheel; E again gets him
                   out). The picture at the wheel is drawn 1:1 on whole px, the car on one of 64 angles: it stays as
                   sharp as a man on foot. In the NORTH lane THE BOSS's convertible, the Uzi on its seat (the grab,
                   as at 22): the car's feel (the nose on its spring, the body on its springs, the shove), what the
                   speed does to the picture's edges, and its gun ALL ROUND (125 degrees either side of the nose) on
                   three pursuers' black cars standing where the chase's pursuers hold (systems/Pursuit.js `slots`;
                   each gunman tells his shot every few seconds at whoever comes near, harmlessly): as he draws level
                   with the first, it is ABREAST of him in the other lane (the shove: half its hp and thrown aside,
                   two wreck it), the second a length AHEAD in that lane, the third AHEAD in his own lane (over the
                   windscreen): shoot a windscreen (the driver), a front tyre, the gunman, or shove one into the
                   wall. In the south lane a van (a closed car: his hand out of its window, its arc the driver's
                   side and ahead only), two bins in its way, station 17's barrel, parked van and cars to shove, the
                   end wall to die on nose-on. Past the pursuers, station 17's parked cars are SHOVED ASIDE: the
                   one in the convertible's lane full on the nose (thrown on ahead and out of his way, half his
                   speed gone: a parked car is never a wall nor the crash), the van in the other lane grazed with a
                   turn of the wheel (it slides aside, a tenth of his speed gone). THE SLIDE: W then S at once (a flick), W or S held (full lock), SPACE: the tail
                   steps out, the rear tyres smoke and leave rubber; steer against it and it is caught
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
                   takedowns room (col 63, row 3): the aim cue, LOCK, to try, above all with a gamepad (data/aim.js,
                   render/AimArt.js; its mark on the man, the AIM MARK floor chevron, the pad's assist). Four dummies at
                   2, 4, 7 and 9 m, one of them behind a wall's end, a crate in the line of the last; a 1911, a
                   SUPER 90, an Uzi and a bat by the door, a box of rounds for each gun. The melee lock (LOCK with a
                   melee weapon: a man in reach is held at the player's side too, he turns onto him before the click
                   and the swing snaps onto him: systems/AimCue.js meleeLock, systems/Lunge.js): the 2 m man and one
                   more (a tire iron on him) two steps south of him, across the aisle from the door: stand between
                   them and aim along it (both at his sides), at one (the other behind); swing from beyond a
                   takedown's reach (blind dummies)
    24 ARCADE      across the street, south row: a customer playing the arcade cabinet (ai/Pastimes.js arcadeAt: the
                   stick, the buttons, the screen in play; a slap and a coin between two games); a shot sends him off
    25 LAUNDRY     next door: a man doing his washing at a top loader (laundryAt: out of the drum, shaken out, folded,
                   laid on the pile on the next lid, the pile to his basket, a look at his watch); he runs at a shot
    26 ARMS        two guards awake, bare-handed (level `arms`, Enemy.armUp): a doorman with his bat stood against
                   the wall at the far end of the room, a brawler (fists only); a knife-man (a blade in his pocket,
                   drawn in a moment). A shot or a noise and the doorman runs for his bat, snatches it up and comes;
                   take the bat first and he comes with his fists
    27 THROW       next door east: the throw (THROW in data/feel.js; hold the right click / LB to wind it up and aim it,
                   let go to throw, a tap throws at once): three dummies down the room at 80, 150 and 220 px from the
                   throwing spot by the door, three knives, a bat, a cue, a tire iron and a 1911 on the floor there; a
                   full throw plants a knife in the farthest, and kills with anything else, which breaks on him (a bat or
                   a cue snaps, the iron bends, the gun is wrecked: WeaponItem.shatter); the hit's beat: systems/ThrowBeat.js
    28 KILL CAM    east again (cols 50-65): the kill cam (systems/KillCam.js, data/killcam.js;
                   ?level=lab&killcam=off turns it off, to compare). By the door a bat, a SUPER 90 and its
                   box, a knife, a tire iron; in the west half three dummies apart to kill each his own way (the
                   heavy stroke, buckshot at arm's length, floored by a slide or a thrown weapon then finished, or
                   taken from behind); in the east half five in a row, a step apart, for a chain and its end
    29 SHIELD      east again (cols 68-73): the human shield (SHIELD in data/feel.js, systems/Shield.js). Two dummies by
                   the door, their backs to it (one with a pistol): E behind one takes him, the right click throws
                   him (at the partition, at the others); past the partition three gunmen, awake, who see only the gap
                   at its south end: step into it with a man held and they hold their fire a moment, then shoot him
    30 SIGNALS     the street's north sidewalk (cols 43-55): level 2A's street furniture to drive at or shoot. A
                   traffic light on its mast arm over the lanes (systems/Signals.js: green, amber, red in turn,
                   data/signals.js), a works barricade whose two lamps flash, a no-parking sign and two bollards
                   (bolted: a car tears them off, as it does the light's pole)
    31 CHASE CAM   the chase's own slow motions and cuts (systems/ChaseCam.js, CHASE.cinema), on the street by station
                   19's pursuers: at the wheel of the convertible (or the van), stop one of the three black cars for
                   good (two shoves, a burst at its windscreen, a front tyre): the FIRST is the strong beat (slow
                   motion that drops and snaps back, a cut in toward the wreck, the engine going in a ball of fire as
                   it skids off burning, smoke off its tyres, sparks and pieces lost); the next one within seven
                   seconds a light one; two in a breath, one longer beat. Then drive on east to station 21's lorry:
                   on a collision course and close, the world slows until the car is clear of it (the wheel answers
                   in real time and takes the car further). On foot nothing of it plays
    32 CHASE FX    a car in trouble (systems/CarFx.js, data/carfx.js), at the street's east end past the lorry: three
                   parked cars already damaged (prop option `worn`) smoking at each stage, white steam, grey, black
                   with a spit of fire; a round more in the black one sets it alight and it blows up a few seconds
                   later (the fire-ball in stages, its burning tyres down the road, the pops); a coupe to get into
                   (E at its door) that pulls away east: S grinds its flank along the blind wall (sparks for as long
                   as it rubs, by its speed), W into the parked cars; rounds on bodywork spark, a tyre shot out smokes
                   and its rim then throws sparks
    33 SEEPS       what drips, steams and slops in a lived-in room (systems/Seeps.js, data/seeps.js), in a narrow tiled
                   room at the street's very east end (its door past 34's): down the west wall a washer weeping at its
                   foot (its puddle grows to a step wide and holds), a dryer breathing steam (its load tumbling behind
                   the door), a keg on tap dripping beer until it is flat, the ice bin, a water cooler, a stove with a
                   pot simmering; on the east wall a repair bench with the iron left hot (its thread of smoke), a wall
                   of televisions and the recorders blinking 12:00; a clock; two mop buckets to shove or kick (they
                   slop over the way they go, until empty), a pistol to hole the keg, the cooler and the buckets; on
                   the floor a sample of the rooms' own marks (mould, dust, drips, rust, prints, runoff)
    34 FLAT        the prologue's flat in one room (tools/build_tutorial.py), north of the street's east end past 32:
                   what drips (systems/Seeps.js, SEEPS joint / pail: the water heater's joint on the east wall, the pail
                   that runs over: watch the puddles grow to their size and stop, kick the pail, break either), what
                   fumes (data/clutter.js `fume`, SMOKE.fumes: the pan on the stove, the kettle on the worktop: knock
                   them off, it stops), its furniture to break and push, what lies on its floor and the five marks
                   of an old flat painted in it (render/FloorWear.js: damp, flakes, grease, leak, threadbare)
    35 PROPANE     the prologue's gas bottle (prop `propane`, data/props.js: a 47 kg cylinder, bolted by its weight, a
                   far bigger blast than a stove's bottle), in a bare room north of the street between 20's and 32's:
                   a pistol at the door; a round holes it (the jet of flame from the hole, the fuse a
                   second or two: get out), a second one sets it off at once; crates and a table for the blast to
                   take, the blast lights the floor (systems/FireSpread.js). In the prologue the same bottle is kept
                   for the end (prop.staged): its valve lit as the last man falls (systems/Tutorial.js fuse)
    36 BEND        a scripted corner of the chase's route (systems/Route.js legs and bends, CHASE.bend), under the
                   lab: down the passage at the street's east end (cols 91-93) to a road of its own, THE BOSS's
                   convertible parked in its south lane (E at its door). It pulls away east; at col 92 the script
                   takes the wheel (W / S do nothing, the gun is still his): it brakes, turns right down the side
                   street, the tail out, smoke and rubber off the rear tyres, a breath of slow motion at each turn,
                   the camera following it down and round, then left onto the lower road, its lane, and the wheel
                   is his again. The turn is a short smash alley (CHASE.bend.smash): crates, a hydrant, boxes, a bin and
                   bags, a fruit cart, washing across the side street, then a scooter, a wheeled dumpster and crates on
                   the lower road: torn, thrown and burst on his line, the first crates slowing the world (ChaseCam
                   'smash'). The lower road runs on east to 37's toll
    37 TOLL        a toll's two gates (systems/Toll.js, CHASE.toll; level 2A's event 3), at the lower road's east end:
                   a convertible parked on it (E at its door; 36's car comes out on it too). The road opens round
                   three islands, a crash cushion at each nose, a lit booth on two; the north lane shut by a wooden arm
                   (its signal a green arrow), the south one, the lane he is in, by a steel boom (a red X). Told 1.5 s
                   out: bone arrows down the wooden lane, red on the steel one. Through the arm: it flies in its
                   lengths, a tenth of the speed lost, a breath of slow motion; nose-on into the boom: the crash. The
                   road ends on a wall past it: E to get out before it
    38 BILLBOARD   two billboards on the grass verge south of 36's lower road (cols 113-144), high on their catwalks
                   (prop mount 'billboard': data/mounts.js, entities/Board.js, data/billboards.js): a pistol, an Uzi, a
                   SUPER 90 and a rifle on the sidewalk by the label, a barrel under the motel's catwalk. Every round
                   through a face punches a hole where its line crosses it and flies on (a billboard never stops a
                   round nor the aim's line); a lamp on its line is shot out (its light goes, sparks, glass), one by
                   one; as the face takes more the paper peels and hangs in strips, then the lettering is ripped and
                   sheets torn out show the frame and the grass under it, then the face is gone, shreds hanging off
                   the frame, paper flying. The frame, its catwalk and its posts never move. The barrel's blast tears
                   the motel's face and puts its lamps out. (Drive 36's convertible down the lower road and shoot them
                   from the car too.)
The guards are passive dummies (they see and hear nothing but go on at their job), except the `awake` ones (the two
sight tests, CUEBALL, the shield's three gunmen).
F1 is open from the start (game/debug/Sandbox.js); T wakes or freezes them all.
"""
from levelkit import Level

W, H = 200, 58                             # (cols 63-74 are 15 CUEBALL's room, in the brick; east of them only the street, 32 CHASE FX;
                                           # rows 31 on and cols 96 on: 36 BEND's two roads, under the rest; cols
                                           # 149 on: 37 TOLL on the lower road)
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
lv.fill(33, 25, 48, 25, 's')               # 27 THROW: the sidewalk carried on east, a long room off it
lv.fill(33, 26, 48, 29, '#')
lv.fill(34, 27, 47, 29, '_')
lv.put(35, 26, '_')
lv.fill(49, 25, 66, 25, 's')               # 28 KILL CAM: the sidewalk goes on east, one more room off it
lv.fill(49, 26, 66, 29, '#')
lv.fill(50, 27, 65, 29, '.')
lv.put(57, 26, '.')
lv.fill(67, 25, 74, 25, 's')               # 29 SHIELD: the sidewalk once more, a room cut in two by a partition
lv.fill(67, 26, 74, 29, '#')
lv.fill(68, 27, 73, 29, '.')
lv.put(69, 26, '.')
lv.fill(71, 27, 71, 28, '#')               # the partition: the gunmen east of it see the gap at its south end only

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
# thin gun, a wide one, a fast one and a blade to see what LOCK tells of each
lv.paint('label_aim', 61.6, 3.6)
for (x, y), kind in (((64.6, 1.5), 'pistol'), ((65.4, 1.5), 'shotgun'), ((64.6, 2.2), 'uzi'), ((65.4, 2.2), 'bat')):
    lv.drop(kind, x, y, 0)
lv.actor('n', 64, 5)
lv.actor('g', 65, 5)
lv.actor('m', 67, 2, face=180)             # 2 m from the door
lv.actor('i', 67, 4, face=180)             # the melee lock: the 2 m man's pair, across the aisle from him
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
lv.prop('barrel', 9.2, 24.4)               # (west of station 19's pursuers: the south lane is theirs from col 10 on)
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

lv.area('30 signals: a traffic light over the lanes, a barricade that flashes, a sign, bollards')
lv.paint('label_signals', 45.6, 18.45)
lv.prop('traffic_light', 44.8, 19.72, 90)
lv.prop('barricade', 50.6, 19.4, 0)
lv.prop('sign_noparking', 52.8, 19.75)
lv.prop('bollard', 54.0, 19.7)
lv.prop('bollard', 55.0, 19.7)

lv.area('19 drive: the convertible and a van to get into and drive down the street, three pursuers where the chase holds them')
lv.paint('label_drive', 8.2, 18.6)
lv.prop('convertible', 4.7, 21.0, 0, drive=True)  # the north lane: E at its driver's door (on the sidewalk)
lv.prop('van', 4.6, 23.5, 0, drive=True)   # the south lane: E at its driver's door (its north side)
lv.prop('trash_can', 8.3, 23.9)
lv.prop('trash_can', 9.0, 23.0)
# the chase's slots (data/chase.js CHASE.pursuit.slots), as the convertible draws level with the first one
lv.prop('pursuer', 12.6, 23.5, 0, pursuer=True)                 # ABREAST in the other lane: the shove
lv.prop('pursuer', 12.6 + 165 / 32, 23.5, 0, pursuer=True)      # a length AHEAD in that lane
lv.prop('pursuer', 12.6 + 220 / 32, 21.0, 0, pursuer=True)      # AHEAD in its own lane: over the windscreen
# past the pursuers, station 17's parked cars are what he SHOVES ASIDE (systems/Drive.js aside; a parked car is never
# a wall): the car in the convertible's own lane (col 30) full on the nose (half his speed, thrown on ahead and out
# of his way, never the crash), the van in the south lane grazed with a turn of the wheel (a tenth of his speed, it
# slides to its kerb). Before them, room to throw the car about: W then S at once (a flick), W or S held (full
# lock), SPACE: the tail steps out, smoke and rubber off the rear tyres; steer against it and it is caught
lv.area('31 chase cam: the beats at the wheel, on station 19\'s pursuers and station 21\'s lorry')
lv.paint('label_chasecam', 16.4, 18.6)

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

lv.area('34 flat: the prologue\'s furniture, what drips and what fumes')
lv.fill(79, 12, 88, 17, '#')               # a room in the brick north of the street's east end, its door on the sidewalk
lv.fill(80, 13, 87, 16, '+')
lv.put(83, 17, '+')
lv.paint('label_flat', 84.6, 18.6)
lv.prop('ceiling_lamp', 84.0, 15.0)
lv.prop('worktop', 81.6, 13.28, clutter='flat_worktop')    # the kettle steams on it
lv.prop('oven', 82.9, 13.32, clutter='flat_stove')          # the pan smokes on it
lv.prop('calendar', 84.2, 13.07)
lv.prop('mirror_cracked', 85.3, 13.09)
lv.prop('mailboxes', 86.7, 13.09)
lv.prop('boiler', 87.91, 14.6, 90)                          # its joint drips on the tiles
lv.prop('bucket', 87.3, 16.4)                               # full: it runs over
lv.paint('mattress', 80.8, 15.1)
lv.prop('nightstand', 81.9, 14.45)
lv.prop('duffel_bag', 85.3, 14.2, 15)
lv.prop('chair_jacket', 86.6, 14.2, 200)
lv.prop('coffee_table', 84.5, 15.4, clutter='flat_coffee')
lv.prop('record_player', 86.2, 16.72, 180)
lv.prop('plant_dead', 80.4, 16.6)
lv.paint('clothes_pile', 82.3, 16.3, 20)
lv.paint('pizza_box', 83.2, 14.6, 20)
lv.paint('bottles_empty', 82.6, 15.3, 40)
lv.paint('mail_pile', 83.5, 16.6, 30)
lv.paint('boards_loose', 85.0, 16.4, 15)
lv.paint('phone_floor', 86.9, 15.3, 200)
lv.paint('trash_spill', 81.6, 16.5, 100)
lv.paint('cutlery_spill', 82.0, 14.1, 200)
lv.grime_at('grease', 82.9, 14.0, r=12)
lv.grime_at('leak', 87.6, 14.7, r=9)
lv.grime_at('leak', 87.4, 16.6, r=9)
lv.grime_at('damp', 80.3, 13.3, r=13)
lv.grime_at('flakes', 85.6, 13.2)
lv.grime_at('flakes', 80.2, 15.8)
lv.grime_at('crack', 84.8, 14.6, len=[14, 40], d=-14, lit=4)
lv.grime_at('threadbare', 83.6, 15.9, r=10)

lv.area('35 propane: the big gas bottle of the prologue\'s end, a pistol to hole it from the door')
lv.fill(70, 13, 76, 17, '#')               # a bare room in the brick north of the street, its doorway on the sidewalk
lv.fill(71, 14, 75, 16, ',')
lv.put(72, 17, ',')
lv.paint('label_propane', 72.0, 18.6)
lv.prop('propane', 74.9, 14.6, 20)         # at the back, away from the door: a round, then run
lv.prop('crate', 73.6, 14.5, 10)
lv.prop('cardboard_box', 75.3, 16.3, 30)
lv.prop('table', 71.9, 14.6)
lv.prop('ceiling_lamp', 73.5, 15.5)
lv.drop('pistol', 72.5, 18.2, 90)

lv.area('32 chase fx: cars smoking at each stage of damage, one to set alight and blow up, a car to grind along the wall')
lv.fill(73, 18, 94, 19, 's')               # the street carried on east once more, a blind wall along its south kerb
lv.fill(73, 20, 94, 24, '=')
lv.fill(73, 22, 94, 22, '-')
lv.paint('label_chasefx', 76.4, 18.6)
# the engine's smoke by the hp already gone (prop option `worn`, CARFX.smoke.stages): steam, grey, black. The black
# one is a round from catching fire (Vehicle BURN): shoot it, it burns, then goes up (the fire-ball, its burning
# pieces, the pops); rounds on any of them spark, their windows burst, a tyre shot out smokes
lv.prop('car', 78.0, 21.0, 0, worn=0.25)
lv.prop('car2', 83.0, 21.0, 0, worn=0.45)
lv.prop('car', 88.2, 21.0, 0, worn=0.6)
# E at its driver's door: it pulls away east; S steers its flank into the blind wall (the shower of sparks, the paint
# scored, the grind), W into the smoking cars (car on car). Its tyres smoke as it pulls away and at a shove (SPACE)
lv.prop('car2', 75.4, 23.6, 0, drive=True)
for x in (80.5, 90.5):
    lv.prop('wall_lamp', x, 18.08, 0)

lv.area('33 seeps: what drips, steams and slops over (systems/Seeps.js), the rooms\' own floor marks')
lv.fill(89, 5, 95, 17, '#')                # a narrow tiled room in the brick, east of 34's
lv.fill(90, 6, 94, 16, '+')
lv.put(92, 17, 'D')
lv.paint('label_seeps', 92.4, 18.6)
lv.prop('washer', 90.4, 6.6, 270, seep='washer')   # the drips, north to south down the west wall
lv.prop('dryer', 90.4, 7.6, 270)
lv.prop('keg', 90.4, 8.6, seep='keg')
lv.prop('ice_bin', 90.25, 9.5, 270)
lv.prop('water_cooler', 90.35, 10.4)
lv.prop('oven', 90.35, 11.4, 270, seep='pot')
lv.prop('wall_clock', 92.5, 6.08)
lv.prop('repair_bench', 94.6, 7.5, 90)             # the iron's thread, on the east wall
lv.prop('tv_stack', 94.65, 10.0, 90)               # machines left on
lv.prop('vcr_shelf', 94.78, 12.2, 90)
lv.prop('mop_bucket', 92.3, 9.0)                   # to shove, to kick, to shoot
lv.prop('mop_bucket', 92.6, 12.0)
lv.prop('wet_sign', 92.0, 13.5, 15)
lv.prop('tube_light', 91.0, 16.93, 180)
lv.prop('tube_light', 94.0, 16.93, 180)
lv.prop('tube_light', 91.3, 6.07)
lv.drop('pistol', 93.4, 15.5, 200)
# the marks a room grows, one of each (render/FloorWear.js)
lv.grime_at('mould', 90.2, 16.75, r=8)
lv.grime_at('rust', 90.4, 6.6, w=23, h=23)
lv.grime_at('runoff', 90.85, 6.6, r=15, deg=0)
lv.grime_at('dust', 94.55, 12.2, w=36, r=5, deg=90)
lv.grime_to('drips', 91.2, 14.2, 93.2, 15.4)
lv.grime_to('prints', 92.5, 16.85, 91.4, 14.6)

lv.area('36 bend: a road of its own under the lab, a scripted corner down a side street onto a lower one')
# (systems/Route.js: leg 0 its road, rows 33-37; the bend at col 92, right down the side street (cols 96-103), left
# onto leg 1, rows 45-49; the routes are written into the level: `routes.bend`, the car's option `route`)
lv.fill(91, 25, 93, 31, 's')               # the passage down from the street's east end
lv.fill(60, 32, 107, 32, 's')
lv.fill(60, 33, 107, 37, '=')
lv.fill(60, 38, 95, 38, 's')
lv.fill(104, 38, 107, 38, 's')
lv.fill(94, 38, 105, 42, 's')              # the side street, its sidewalks
lv.fill(96, 38, 103, 44, '=')
lv.fill(88, 43, 148, 44, 's')              # the lower road
lv.fill(96, 43, 103, 44, '=')
lv.fill(88, 45, 148, 49, '=')
lv.fill(88, 50, 148, 50, 's')
for c in range(60, 107, 4):
    if not 92 <= c <= 105:
        lv.fill(c, 35, c + 1, 35, '-')
for c in range(88, 148, 4):
    if not 92 <= c <= 105:
        lv.fill(c, 47, c + 1, 47, '-')
lv.paint('label_bend', 64.6, 32.55)
lv.prop('convertible', 66.0, 36.75, 0, drive=True, route='bend')   # its driver's door on the north lane
lv.prop('road_closed', 106.4, 35.0, 90)    # the road shut past the side street
lv.prop('sign_detour', 89.5, 38.5)
lv.paint('detour_arrow_paint', 84.0, 36.75)
for x in (70.5, 86.5):
    lv.prop('wall_lamp', x, 32.08, 0)
for x in (112.5, 136.5):
    lv.prop('streetlight', x, 44.72, 90)
# the turn is a short smash alley (CHASE.bend.smash, level 2A's alley): what stands on the bend's line is torn off,
# thrown and burst; washing across the side street is torn down over him; the first crates slow the world
for (kind, c, r, deg) in (('produce_crates', 98.6, 38.9, 40), ('hydrant', 99.75, 40.9, 0), ('box_stack', 100.2, 42.6, 0),
                          ('trash_can', 99.6, 43.8, 0), ('bin_bag', 100.6, 44.0, 0), ('fruit_cart', 101.7, 46.6, 45),
                          ('scooter_mint', 104.2, 48.4, 0), ('dumpster_pink', 108.5, 48.9, 0), ('produce_crates', 112.0, 48.6, 0)):
    lv.prop(kind, c, r, deg)
lv.prop('laundry_line', 100.0, 41.2)

lv.area('37 toll: the lower road opens round three islands, a wooden arm on the north lane, a steel boom on the south one')
# (systems/Toll.js: the route's `toll`; its lanes 4.5 m apart round the middle island, as on level 2A's plaza)
T_NOSE, T_GATE = 166.0, 174.1              # the islands' noses (8 m long), the gates at their ends
T_LANES, T_ISLES = (45.25, 49.75), (43.0, 47.5, 52.0)
lv.fill(149, 43, 157, 44, 's')             # the lower road carried on east
lv.fill(149, 45, 157, 49, '=')
lv.fill(149, 50, 157, 50, 's')
lv.fill(158, 41, 198, 54, '"')             # then out of the town: grass verges, the road opening to the plaza
lv.fill(158, 45, 198, 49, '=')
lv.fill(158, 42, 181, 53, '=')
for c in range(148, 157, 4):
    lv.fill(c, 47, c + 1, 47, '-')
lv.paint('label_toll', 152.0, 44.5)
lv.prop('convertible', 152.0, 48.75, 0, drive=True, route='bend')   # (on the lower road: leg 1 of 36's route)
for (k, r) in enumerate(T_LANES):
    lv.paint('toll_text', 161.5, r, 90)
    lv.paint(f'toll_lane_{k + 1}', 163.5, r, 90)
for (i, r) in enumerate(T_ISLES):
    lv.prop('crash_cushion_narrow', T_NOSE - 84 / 64 - 0.05, r)
    lv.prop('toll_island', T_NOSE + 254 / 64, r)
    if i < 2:
        lv.prop('toll_booth', T_NOSE + 5.0, r)
    if i > 0:
        lv.prop('lane_signal_go' if i == 1 else 'lane_signal_stop', T_NOSE + 1.4, r)
lv.prop('gate_arm_wood', T_GATE, T_LANES[0] - 11 / 32, 90)
lv.prop('gate_steel', T_GATE, T_LANES[1] - 12 / 32, 90)
for (c, r) in ((160.5, 41.6), (176.5, 53.4)):
    lv.prop('highway_lamp', c, r, 90)
for r in (45.6, 47.0, 48.4):
    lv.prop('traffic_cone', 195.5, r)          # the wall at its end: E to get out before it

routes = {'bend': {
    'legs': [{'from': 0, 'to': 100, 'lanes': [34.25, 36.75], 'mid': 35.5, 'kerbs': [33, 38], 'across': [[94, 105, 33, 38]]},
             {'from': 100, 'to': W, 'lanes': [46.25, 48.75], 'mid': 47.0, 'kerbs': [45, 50]}],
    'bends': [{'at': 92, 'path': [[92, 36.75], [100, 36.75], [100, 48.75], [116, 48.75]], 'radius': 6, 'to': 1}],
    # 37 TOLL's gates, north lane first (the approach's lanes `from`, the plaza's `lanes`, where they spread: `fan`)
    'toll': {'at': T_GATE, 'lanes': list(T_LANES), 'from': [46.25, 48.75], 'fan': [158, 164], 'nose': T_NOSE, 'gates': ['wood', 'steel']},
}}

lv.area('38 billboard: two billboards on the lower road\'s verge, to shoot to shreds')
lv.fill(112, 51, 145, 56, '"')             # the grass verge south of the lower road's sidewalk
lv.paint('label_billboard', 114.6, 50.5)
lv.prop('billboard_tan', 120.0, 53.6)      # (hung high on its catwalk: no body, its face over the grass)
lv.prop('billboard_motel', 137.0, 53.6)
for (x, kind) in ((112.6, 'pistol'), (113.3, 'uzi'), (114.0, 'shotgun'), (114.7, 'rifle')):
    lv.drop(kind, x, 50.1, 0)
lv.prop('barrel', 134.6, 55.6)             # under the motel's catwalk: its blast tears the face

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

lv.area('27 throw: three dummies down a long room, things to throw at them')
lv.paint('label_throw', 37.5, 25.5)
# the throwing spot (35.5, 28.5), under the doorway: the dummies 80, 150 and 220 px east of it, on its row
for n, d in enumerate((80, 150, 220)):
    x = 35.5 + d / 32
    lv.actor('mji'[n], int(x), 28, face=180, at=(x, 28.5))
for x, kind in ((34.4, 'knife'), (34.9, 'knife'), (35.4, 'knife')):
    lv.drop(kind, x, 27.5, 0)
lv.drop('bat', 34.6, 29.4, 0)
lv.drop('pistol', 35.6, 29.4, 0)
lv.drop('tire_iron', 36.7, 29.4, 0)
lv.drop('cue', 37.2, 27.4, 0)
for x in (37.0, 43.0):
    lv.prop('ceiling_lamp', x, 28.0)

lv.area('28 kill cam: men to kill each his own way, five in a row for a chain')
lv.paint('label_killcam', 57.5, 25.5)
for x, kind in ((56.0, 'bat'), (56.7, 'knife'), (58.6, 'shotgun'), (59.3, 'tire_iron')):
    lv.drop(kind, x, 27.5, 90)
lv.actor('g', 59, 28)                      # the shotgun's box
lv.actor('k', 51, 27, face=0)              # the west half: three apart
lv.actor('b', 53, 29, face=180)            # (his back to the door: a takedown)
lv.actor('j', 54, 27, face=90)
for x in range(61, 66):
    lv.actor('k', x, 28, face=180)         # the east half: five in a row, a step apart
for x in (53.0, 62.5):
    lv.prop('ceiling_lamp', x, 28.5)

lv.area('29 shield: two men to take from behind, three gunmen past a partition')
lv.paint('label_shield', 70.5, 25.5)
lv.actor('p', 69, 28, face=90)             # their backs to the door: E behind one takes him as a shield
lv.actor('m', 68, 28, face=90)
for row in (27, 28, 29):
    lv.actor('p', 73, row, face=180, awake=True)   # they see the gap only: his shield first, then him
lv.drop('knife', 70.4, 27.4, 0)            # a one-handed blade: the throat instead of the neck
lv.drop('bat', 68.4, 27.4, 90)             # two hands: no shield with it
for x in (69.5, 72.8):
    lv.prop('ceiling_lamp', x, 28.0)

# indirect fill only (no visible source): the glow of the city over the street
lights = [
    [12, 22, 9, '#5a6ad8', 0.3],
    [38, 22, 9, '#7a5ad8', 0.3],
    [76, 35, 9, '#5a6ad8', 0.3],
    [100, 41, 8, '#7a5ad8', 0.3],
    [124, 47, 9, '#5a6ad8', 0.3],
    [170, 47, 10, '#7a5ad8', 0.32],
]
# a brighter night than the bar's (LIGHTING.ambient), everywhere one plays: a lab is for seeing what happens. The
# lamps are bulbs and wall lamps, no tubes or neon (the failing ones render/Flicker.js picks among them would add to
# the one lamp going in the yard)
light = dict(inside=[0.36, 0.33, 0.48], street=[0.36, 0.35, 0.52], wall=[0.3, 0.27, 0.42])

if __name__ == '__main__':
    lv.check(guards=52)
    lv.write('lab', name='PHYSICS LAB', subtitle='SANDBOX  -  A STATION FOR EVERY SYSTEM', passive=True, lights=lights, light=light,
             exit=exit_zone, ambient={'traffic': [], 'walkers': []}, routes=routes,
             header=[
                 'Physics lab: a test facility, a concourse with a station on each side (range, executions, soot, pool, bars,',
                 'curtain, takedowns, jukebox, trapdoor, powder, steam, power, liquids, doors, CUEBALL, fire, the coat\'s lane, the aim\'s room) and a',
                 'street with the vehicles. Load with ?level=lab.',
                 'Guards here are passive dummies (blind and deaf, at their job), but those kept `awake`: the two of the sight',
                 'tests, CUEBALL in his room (level 1\'s boss: he fights), the three gunmen of the shield\'s room.',
             ])
