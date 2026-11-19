#!/usr/bin/env python3
"""Builds src/game/data/levels/level1.js ("NO LOOSE ENDS": the MIRAGE bar) with tools/levelkit.py.

    python tools/build_level1.py

Plan (north is up):

    rows  1-4    back lot: getaway van, the way out
    rows  6-10   storeroom | toilets | back room (the boss)
    rows 12-19   the bar: the main room (counter, pool, a booth), the gaming room (poker), the VIP room
    rows 21-22   sidewalk
    rows 23-29   road: parking strip, two lanes of traffic
    rows 30-31   sidewalk
    rows 32-36   the alley where the player starts
    cols 11-13   service alley along the bar, from the street to the back lot
    col  32      the gap between the bar and the next building

The street is alive at 2:14 AM: three shop fronts throw their light on the sidewalks through their display windows
(a liquor store and a TV shop, closed, on either side of the bar; a laundromat open all night next to the start alley).
They are public ground. The liquor store has a ladder to its roof in its back wall: the only way up.

Six ways in, none of them free (the level is made to be played again another way):
    the front    double door under the neon: the bouncer, the sidewalk patrol, the whole room at once
    the gate     west service alley, closed by a chain-link gate to climb (Space): the shortest way to the back, but
                 under a lamp, in full view of the street through the mesh, with a man smoking a few metres further
    the gap      an anonymous door right of the bar opens on a dark one-metre gap: nobody posted there and no light,
                 but it is the long way round, with no room to dodge, past a window of the bar, and it comes out
                 in the back lot under the tube light by the back door, where a guard leans smoking; on its way, a window of the
                 VIP room to dive through
    the roof     up the liquor store's own ladder, in its back wall, to its flat roof (no ladder outside: the user
                 found one on the street made no sense): nobody up there, a bat left by whoever comes to smoke, and
                 two drops over the parapet: into the service alley behind the gate and the smoker's back, or into
                 the west end of the back lot
    the shop     the liquor store: break in by the front (the bell rings, the guards come and look: a diversion as
                 much as a way in), over the counter and up its ladder. The pistol that was behind its counter is hidden up on the roof now, by the
                 lookout's chair over the back lot: a reward for the climb
    the lot      from the back lot: the locked back door (to force), or the toilets' window (a public room: one comes
                 out of it a customer); the boss's room has no window
"""
from levelkit import Level

W, H = 44, 38
# Tightened after the people were drawn 1.3x bigger (the user: the furniture too small for the rooms, or the rooms too
# big): a column out of the west half of the bar's block, one out of its east half. A row was taken out of the bar room
# too, and given back: with it there was no way past between the counter's stools and the booths. The coordinates
# below are the drawing's; the level kit moves them (keep things off the cut lines).
CUT_COLS, CUT_ROWS = (19, 29), ()
lv = Level(W, H, cut_cols=CUT_COLS, cut_rows=CUT_ROWS)


def drawn(col):
    """A column of the level (after the cuts: what tests, QA plans and the game see) in the drawing's: the street
    is laid out in the level's columns, measured against what stands on it, and given back in the drawing's."""
    return col + (2 if col >= 28 else 1 if col >= 19 else 0)


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
# the gaming room in the north-east corner, walled off the main room: a plain door on it, the boss's back room's door
# opens into it from the north, its window looks onto the gap
lv.fill(24, 12, 24, 16, '#')
lv.fill(25, 12, 30, 15, ';')
lv.put(24, 13, 'D')            # main room -> gaming room
lv.put(16, 11, 'D')            # behind the counter -> storeroom
lv.put(22, 11, 'D')            # toilets
lv.put(27, 11, 'L')            # back room -> gaming room, locked: kick it or shoot it
lv.put(14, 8, 'D')             # storeroom -> service alley
lv.put(25, 5, 'L')             # back room -> back lot, locked: the back way in has to be forced (at the west end of
                               # the wall: east of it the desk and his armchair leave only a doorway's width). No
                               # window in the boss's room (the user had it walled up)
lv.put(22, 5, 'G')             # the toilets' window on the back lot
lv.put(31, 17, 'G')            # the VIP room's window on the gap
lv.put(31, 14, 'G')            # the gaming room's window on the gap
for x in (15, 16, 24):
    lv.put(x, 20, 'G')         # facade windows
lv.put(21, 20, 'D')
lv.put(22, 20, 'D')            # front double door
# the street, open at both ends for the traffic
lv.fill(0, 21, W - 1, 22, 's')
lv.fill(0, 23, W - 1, 29, '=')
for c in (0, 1, 4, 5, 8, 9, 31, 32, 35, 36, 39, 40):   # the centre line in dashes, two metres on, two off (level
    lv.put(drawn(c), 27, '-')                           # columns); solid and double toward the crossing: paint, below
lv.fill(0, 30, W - 1, 31, 's')
# the alley across the road
lv.fill(20, 32, 23, 36, '_')
# shop fronts, 3 m deep behind their display windows: liquor store (west of the bar) and TV shop (east), both locked
# for the night, and the laundromat by the start alley, open
lv.fill(3, 17, 8, 19, ',')
# the liquor store's flat roof: up the shop's own ladder (the only way up), down over a parapet
lv.fill(1, 8, 9, 14, '^')
lv.fill(7, 3, 9, 7, '^')       # its north arm, above the back lot
lv.fill(3, 15, 3, 16, '^')     # the shop's own ladder, in its back wall
lv.put(10, 12, '^')            # the parapet over the service alley
lv.put(10, 3, '^')             # ... and over the back lot
lv.fill(5, 20, 7, 20, 'G')
lv.bar((5, 20), (6, 20), (7, 20))   # the liquor store's windows barred for the night: its door is the way in
lv.put(8, 20, 'L')
lv.fill(36, 17, 39, 19, ';')
lv.fill(36, 20, 38, 20, 'G')
lv.put(39, 20, 'L')
lv.fill(27, 33, 31, 35, '+')
lv.fill(27, 32, 29, 32, 'G')
lv.put(30, 32, 'D')
# the doors, one kind per place (src/game/data/doors.js DOORS.kinds: its skin, weight, closer, sounds), nothing to do
# with each other:
#   the front     an American bar's double door: dark varnished wood, a porthole, brass plates, on a closer (the
#                 heat and the noise kept in, the street kept out)
#   the toilets   a pair of swinging cafe doors: pushed either way, back to the middle on their springs, no latch
#   the back door the emergency exit: heavy grey steel, a red push bar inside, the green EXIT sign over it, a closer
#   staff doors   blue-grey paint and a STAFF ONLY plate: behind the counter to the storeroom, and the storeroom's
#                 own door on the service alley (on a closer: it shuts behind the deliveries)
#   the boss      his back room's door into the gaming room: oxblood leather buttoned over padding, brass studs
#   gaming room   a deep green gloss with a brass peephole
#   the shops     glass doors in aluminium (the liquor store, the TV shop, the laundromat)
# The gap's anonymous door on the street keeps the plain wooden one. The VIP room has its curtain.
lv.door(21, 20, kind='bar', inside='n')   # the closer on the bar's side, not the street's
lv.door(22, 11, kind='swing')
lv.door(25, 5, kind='fire', inside='s')
lv.door(16, 11, kind='staff')
lv.door(14, 8, kind='staff', closer=True, inside='e')   # its closer in the storeroom
lv.door(27, 11, kind='office')
lv.door(24, 13, kind='gaming')
for x, y in ((8, 20), (39, 20), (30, 32)):
    lv.door(x, y, kind='shop')

# ---------------------------------------------------------------- actors (12 guards)
# Twelve men with their hands. Three guns in the whole house: the poker dealer's pistol and the money counter's in
# their holsters, the boss's shotgun in the back room; one more for the taking, hidden on the liquor store's roof. A
# pistol holds seven rounds, and nobody carries a spare magazine.
# The others start bare-handed (the user: realistic): their weapon is kept somewhere and they run for it once the
# fight is on (`arms`, entities/Enemy.js armUp): the bartender's bat behind the counter, the doorman's leant against
# the front wall, the cue by the pool table for the VIP room's doorman, the pimp's blade on his table. Two carry a
# knife in their pocket (out in a moment), two fight with their fists (brawlers), the man on the couch has his tire
# iron in his hands already (he plays with it).
lv.actor('@', 20, 33, face=0)
lv.intro = 'swig'                                       # on the ground, his back to the wall, the last of a bottle of
                                                        # rum in his hand: he drinks it off, smashes it, gets up

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
lv.guard(24, 12, 30, 15)                                # the gaming room and its door
# customers hang about freely in the bar room and the toilets (not in front of the VIP door: the bouncer's spot)
lv.host(21, 12, 23, 12)
lv.host(15, 13, 23, 15)
lv.host(15, 16, 23, 19)
lv.host(21, 6, 23, 11)

# what each place sounds like (src/game/data/soundscape.js), the first that holds a tile wins; the street, the roofs and
# the rest under a roof need none. A dry night: no rain heard.
lv.sound_spot('window', 9, 31)            # a radio left on behind a window above the shops across the road
lv.sound('vip', 25, 17, 30, 19)          # the dancer's corner, its doorway on the bar room
lv.sound('office', 25, 12, 30, 15)       # the gaming room: low voices, cards, the radio
lv.sound('bar', 15, 12, 30, 19)          # the bar room: talk, glasses, the bartender
lv.sound('toilets', 21, 6, 23, 10)
lv.sound('office', 25, 6, 30, 10)        # the boss's back room: his radio
lv.sound('kitchen', 15, 6, 19, 10)       # the storeroom
lv.sound('lot', 11, 0, 32, 4)            # the back lot, the service alley and the gap: the bar's back
lv.sound('lot', 11, 5, 13, 20, place='service')   # (what the guards call them: src/game/data/barks.js PLACES)
lv.sound('lot', 32, 5, 32, 19, place='gap')
lv.sound('shop', 3, 17, 8, 19, place='liquor')    # liquor store, TV shop, laundromat
lv.sound('shop', 36, 17, 39, 19, place='tvshop')
lv.sound('shop', 27, 33, 31, 35, place='laundry')
lv.sound('alley', 20, 32, 23, 36)        # the start alley across the road
lv.rain = 0                                             # no rain heard
lv.wet = 0.35                                           # the street wet from an earlier rain (seen)
# street
lv.actor('b', 24, 21, face=90, job='door', arms=(25.95, 21.12))   # bouncer: his bat against the wall
lv.lean('bat', 25.95, 21.12, 270)                       # ... between the ash post and the news box
# the sidewalk patrol, a blade in his pocket: at either end of his beat a parked car's hood to sit back against for a
# smoke (data/posts.js 'beat' hood; the level opens on him there one time in two, by the coupe's hood)
lv.actor('J', 17, 22, route=[[16, 22], [27, 22]], job='beat')
# the bar
lv.actor('b', 18, 12, face=90, job='wipe', arms=(20.65, 13.42))    # bartender: his bat behind the counter
lv.lean('bat', 20.65, 13.42, 90)                        # ... stood against its back, at the till's end
lv.actor('p', 25, 14, face=0, job='cards')              # dealing poker in the gaming room: a pistol on his hip
lv.lean('cue', 18.6, 19.8, 90)                          # a cue stood against the front wall, by the pool table
lv.actor('b', 24, 17, face=65, job='door', arms=(18.6, 19.8))   # bouncer of the VIP room, an eye on its door: the cue
# customers (civilians): they run for the street when it kicks off
lv.patron('civ1', 16.75, 14.5, 270, 'drink')            # on the counter stools
lv.patron('civ2', 15.6, 17.0, 0, 'drink')               # alone in the booth
lv.patron('civ4', 26.5, 15.25, 270, 'cards')            # the poker game, across the table from the dealer
lv.patron('civ3', 23.35, 13.12, 270, 'arcade')          # at the arcade in the corner, his back to the room
lv.patron('civ7', 26.55, 19.45, -27, 'watch')           # the VIP room: a customer, a dancer (the doorway kept clear)
# (the user, 2026-11-18: two customers too many blurred the room; the second poker player and the VIP room's man on
# the sofa went)
lv.patron('dancer1', 30.0, 18.9, 180, 'dance')
# back of house
lv.actor('j', 17, 8, face=90, job='dope', arms=(18.5, 8.5))   # the pimp, alone, weighing and bagging his dope ...
lv.actor('6', 18, 8)                                    # ... his blade on the table by him
lv.actor('k', 21, 9, face=0, job='piss', arms='fists')  # in the toilets: the bowl, the sink, a smoke against the wall
lv.actor('h', 30, 7, face=180, job='cueball', look='cueball')  # CUEBALL, the level's boss (data/bosses.js), in the
#                                                     armchair, feet up on the desk, his pump-action against it
lv.actor('p', 28, 10, face=0, job='count')              # alone with the boss, counting the night's banknotes by his
#                                                     case, a pistol on his hip: the second gun of the house
lv.actor('6', 32, 17)                                   # a blade someone dropped in the gap
# back lot: two men out for a smoke, talking face to face past the back door (the user, 2026-11-19: the couch man
# came out of the boss's room for it, his tire iron in hand); the other has only his fists
lv.actor('b', 27, 4, face=-27, job='yard', arms='fists')
lv.actor('i', 30, 3, face=153, job='yard')
# the service alley: a man smoking against the bar's wall under the cyan tube, by the storeroom door, a knife in his
# pocket
lv.actor('k', 12, 8, face=180, job='alley')

# ---------------------------------------------------------------- props
lv.area('the alley where it starts')
lv.prop('dumpster', 23.42, 35.0, 90)
lv.prop('trash_can', 20.45, 36.4)
lv.prop('trash_can', 20.5, 35.6)
lv.prop('trash_can', 23.3, 32.5)                        # on the cat's way out
lv.cat(23.4, 34.5)                                      # on the dumpster, watching him
lv.pigeons(16.5, 30.6, 3)                             # on his way across: up as he comes (two flocks in the level,
                                                        # this one and the gap's: the user found four too many)
lv.prop('string_lights', 22.0, 33.9)
lv.prop('string_lights', 22.0, 36.1)
lv.prop('wall_lamp', 20.09, 35.0, 270, flicker='broken')   # down the alley from where he sits (never over him), on its last legs

lv.area('south sidewalk')
lv.prop('streetlight', 15.5, 30.3, 270)
lv.prop('streetlight', 28.5, 30.3, 270)
lv.prop('bench', 12.5, 31.7, 180)
lv.prop('hydrant', 26.5, 30.35)
lv.prop('news_box', 10.7, 31.8, 180)
lv.dress('papers', 0, 30, 43, 31, 9)
lv.dress('papers', 20, 32, 23, 36, 3)
lv.dress('beds', 22.1, 36.5, 0)                          # a tramp asleep on his cardboard, against the wall
lv.patron('tramp', 22.1, 36.5, 180, 'sleep')
lv.prop('neon_sign_palm', 17.0, 31.91, 180)
lv.prop('flyers', 13.4, 31.94, 180)                     # the south side's wall, by the bench
lv.paint('tag', 21.2, 34.9, -8)                         # the start alley: a tag on the ground by where he sat
lv.prop('palm_tree', 4.5, 31.2)
lv.prop('palm_tree', 39.5, 31.2)
# (level columns) a second news box and the morning's bundle by the first, a mailbox on the kerb past the
# laundromat, the limit's sign for who drives in from the west: all off the two lines the passers-by walk
lv.prop('news_box', drawn(11.25), 31.8, 180)
lv.prop('paper_bundle', drawn(9.95), 31.74)
lv.prop('mailbox', drawn(31.0), 30.36)
lv.prop('sign_speed', drawn(2.5), 30.3)
lv.prop('shopping_cart', drawn(22.3), 36.45, 90)        # the tramp's, down the start alley past the dumpster

lv.area('road: parked along the bar side')
# The street as a street is made, with level 2A's kit (floor paint: no body, baked once into the floor layer under
# everything that stands; ROAD_PAINT in tools/generate_assets.py). North to south (rows): the bar's sidewalk 21-22,
# its kerb, the parking row 23-24, their lane 25 to 27.5 (westbound), ours down to 30, the kerb, the sidewalk 30-31.
# West to east along the parking row (LEVEL columns, after the cuts: `drawn` gives the drawing's):
#
#     0-3.4      a bay, empty: what engines dripped there
#     3.4-9      the liquor store's LOADING bay, in yellow, its kerb yellow, a sign on a post
#     9-10.6     the hydrant: a red kerb, its valve in the gutter
#     10.6-14.4  the service alley's gate: the kerb dropped, the row hatched in yellow, KEEP CLEAR on the lane. The
#                coupe is parked with its tail over the hatching, across the way out: it is the one the getaway
#                shoves aside (tests/getaway.test.mjs)
#     14.4-19.5  the coupe's bay
#     20-23      the crossing, from the bar's door to the start alley: zebra bars kerb to kerb, the kerbs dropped
#                and their aprons, a stop line and SLOW before it in each lane, red kerbs either side, the centre
#                line double and solid for nine metres toward it
#     23.3-26.5  too short for a bay: hatched, a yellow kerb (the bar's front kept free)
#     26.65-36.85  two bays: the pink car, the van
#     36.85-42   the gas board's bay: a steel plate over what is still open, its cut across both lanes patched,
#                a barricade with its two flashers toward who comes, cones along the lane, the sign
#
# Nothing of it stands in a lane (the traffic's drivers stop for what does: systems/Ambient.js) and nothing with a
# body is put where the getaway comes out of the alley and slides away west (tests/road.test.mjs).
PARK_ROW, THEIRS, OURS = 24.0, 26.25, 28.75             # the middle of the parking row and of the two lanes
ZEBRA = 20                                              # the crossing: three metres from this column
TEES = (3.4, 9.0, 14.4, 19.5, 26.65, 31.75, 36.85, 41.95)   # where two bays meet


def paint(kind, col, row, deg=0):
    lv.paint(kind, drawn(col), row, deg)


# what the years did to it, under the paint: patches, sealed cracks, oil in the bays, rubber before the crossing
for (kind, col, row, deg) in (('road_patch_b', 39.2, 26.95, 90),      # the gas board's cut, from its plate to the far kerb
                              ('road_patch_c', 9.6, 28.8, 0), ('road_patch_a', 32.2, 26.2, 0),
                              ('road_crack_b', 3.2, 27.3, 0), ('road_crack_a', 17.6, 26.3, 180), ('road_crack_a', 33.0, 28.6, 0),
                              ('skid_marks', 25.7, 26.3, 180),        # somebody stood on his brakes for the crossing
                              ('oil_stain_b', 1.7, 24.1, 0), ('oil_stain_a', 7.9, 23.85, 90), ('oil_stain_a', 18.3, 24.2, 180)):
    paint(kind, col, row, deg)
# the parking row: its edge line (none across the gate's hatching nor the crossing), a tee where two bays meet
for col in (1.5, 4.5, 7.5, 9.1, 15.9, 18.5, 24.5, 27.5, 30.5, 33.5, 36.5, 39.5, 40.5):
    paint('road_edge', col, 25.0)
for col in TEES:
    paint('park_tee', col, PARK_ROW)
paint('road_loading', 4.9, PARK_ROW)                    # (west of the lamp's head: it reads whole)
paint('hatch_bay', 12.5, PARK_ROW)
paint('hatch_kerb', 24.9, PARK_ROW)
paint('road_keep', 14.3, THEIRS, 270)                   # read by who drives west: KEEP first
paint('road_clear', 11.6, THEIRS, 270)
# the crossing
for r in range(23, 30):
    paint('zebra_b' if r % 3 == 0 else 'zebra_a', ZEBRA + 1.5, r + 0.5)
paint('kerb_ramp_s', ZEBRA + 1.0, 23 - 15 / 32)
paint('kerb_ramp_n', ZEBRA + 1.0, 30 + 15 / 32)
paint('stop_line', ZEBRA - 0.75, OURS)
paint('stop_line', ZEBRA + 3.75, THEIRS)
paint('road_slow', 16.5, OURS, 90)
paint('road_slow', 28.6, THEIRS, 270)
paint('road_arrow', 6.5, OURS)
paint('road_arrow', 36.0, THEIRS, 180)
for col in (12.5, 15.5, 18.5, 24.5, 27.5):
    paint('centre_double', col, 27.5)


def lay_kerb(row, side, looks):
    """A kerb along the whole street on the edge `row` between a sidewalk and the road on its `side` ('s' / 'n'),
    stone by stone; looks: level column -> '_low' (dropped) | '_red' (no stopping) | '_yellow' (loading); the plain
    ones in four-metre lengths where they run."""
    y, c = row + (-1 if side == 's' else 1) / 32, 0
    while c < lv.w:
        n = 4 if all(c + i < lv.w and c + i not in looks for i in range(4)) else 1
        paint(f'kerb_{side}' + (looks.get(c, '') if n == 1 else '_4'), c + n / 2, y)
        c += n


lay_kerb(23, 's', {**{c: '_yellow' for c in (4, 5, 6, 7, 8, 24, 25, 26)}, **{c: '_red' for c in (9, 10, 19, 23)},
                   **{c: '_low' for c in (11, 12, 13, ZEBRA, ZEBRA + 1)}})
lay_kerb(30, 'n', {**{c: '_red' for c in (24, 25, 26)}, **{c: '_low' for c in (ZEBRA, ZEBRA + 1)}})   # (red: its hydrant)
# iron in the ground: drains in the gutters, the hydrants' valves, covers in the sidewalks, the palms' grates
for col in (18.4, 39.4):
    paint('drain', col, 23 + 8 / 32)
for col in (8.5, 23.6, 34.5):
    paint('drain', col, 30 - 8 / 32)
paint('valve_cap', 10.6, 23.6)
paint('valve_cap', 25.5, 29.5)
paint('manhole_sq', 29.0, 22.35)
paint('manhole_sq', 33.6, 30.9, 90)
for (col, row) in ((4.5, 31.2), (37.5, 31.2), (39.6, 21.8)):
    paint('tree_grate', col, row)
# the gas board's bay
paint('steel_plate', 39.2, 23.95)
lv.prop('barricade', drawn(40.75), 23.98, 90)
lv.prop('sign_works', drawn(41.45), 24.1, 270)
for (col, row) in ((37.75, 23.35), (37.8, 24.05), (38.0, 24.82), (39.2, 24.84), (40.3, 24.82)):
    lv.prop('traffic_cone', drawn(col), row)
# the alleys and the lot behind (concrete): a drain inside the gate and one in the start alley's mouth, a sealed
# crack down the service alley; in the back lot the boss's bay marked out round his convertible and the next one
# empty, its oil, the lot's drain and a cover by the gap's end
paint('drain', 12.4, 19.3)
paint('road_crack_b', 12.5, 16.0)
paint('drain', 21.3, 32.6)
paint('park_tee', 20.3, 2.7)
paint('park_tee', 26.7, 2.7)
paint('oil_stain_b', 28.3, 2.9)
paint('drain', 18.6, 4.4)
paint('manhole_sq', 29.3, 4.2)
lv.prop('car2', 15.0, 24.0, 0, lights=False, trunk='tire_iron')   # E at its tail: a tire iron in the trunk
lv.prop('car', 31.2, 24.0, 180, lights=False)           # parked: its lights off
lv.prop('van', 36.3, 24.05, 180, lights=False)           # in its bay

lv.area('north sidewalk and the facade')
lv.prop('neon_sign_bar', 30.0, 21.09)
lv.prop('neon_sign_arrow', 9.6, 21.09)
# the bar's door, an American bar's (the user, 2026-11-17: the red carpet and velvet ropes "do not look like an
# American bar's entrance"; before that the wall lamps and plain pots were "vile", palms in planters and a GIRLS neon
# "too much", a canvas awning hid the door, a wooden pergola was "too ugly"): the bar's name in neon on the wall west
# of the door (gone since), a red OPEN in the window, a rubber mat at the step, the night's specials chalked on an A-frame and a
# steel ashtray post where the bouncer stands. All clear of the doorway and of the sidewalk patrol's beat (row 22).
# (2026-11-17: the MIRAGE neon and the specials board under it went: with BAR and OPEN the front was "too much")
# (drawing columns: the level's are one less east of the cut at 19. The leaves swing a metre out onto the sidewalk:
# nothing within it; no sign in front of a window, one dives through them)
lv.prop('neon_sign_open', 23.5, 21.09)                  # on the pier east of the door, before the bouncer's window
lv.paint('entry_mat', 22.0, 21.4)                       # at the step, as wide as the double door
lv.prop('ash_urn', 25.4, 21.3)                          # past the bouncer, against the wall
lv.prop('streetlight', 6.5, 22.7, 90)
lv.prop('streetlight', 35.5, 22.7, 90)
lv.prop('bench', 37.5, 22.62, 180)                      # on the kerb, facing the TV shop's window
lv.prop('trash_can', 40.5, 21.35)
lv.pigeons(33.3, 21.7, 2)                             # by the gap's door: nobody ever stands there
lv.prop('hydrant', 10.6, 22.65)                       # clear of the alley's mouth (bigger, it snagged whoever came out)
lv.prop('vending', 17.42, 21.33)                        # drinks machine against the bar's front
lv.prop('news_box', 26.6, 21.19)
lv.prop('flyers', 2.6, 21.06)                           # bills pasted one over the other on the blind walls: west of
lv.prop('flyers', 33.4, 21.06)                          # the liquor store, between the gap's door and the TV shop
lv.dress('papers', 0, 21, 43, 22, 9)
lv.dress('papers', 0, 23, 43, 29, 6)
lv.dress('manholes', 27.3, 28.5)                        # (the one by the parking bays sat astride their line: removed)
lv.prop('palm_tree', 41.6, 21.8)
# what a street has at 2:14 AM (level 2A's kit; level columns): the liquor store's rubbish out for the morning by its
# door (east of it, short of the gate), the loading bay's sign on the kerb, tomorrow's papers dropped by the news box,
# a mailbox between the gap's door and the lamp, a phone booth against the blind wall at the west end (clear of the
# palm's crown at the east one), an awning over the two closed shops' windows (never over
# a door, never the bar's: the user). Nothing bolted on the sidewalk patrol's beat (row 22, cols 16-26), nothing at
# all where the getaway comes out (cols 11-15: tests/road.test.mjs drives it)
lv.prop('bin_bag', drawn(9.75), 21.32)
lv.prop('bin_bag', drawn(10.3), 21.36)
lv.prop('cardboard_box', drawn(10.02), 21.8)
lv.prop('sign_noparking', drawn(3.7), 22.75)
lv.prop('paper_bundle', drawn(26.25), 21.22)
lv.prop('mailbox', drawn(32.4), 22.58)
lv.prop('phone_booth', drawn(1.1), 21.44)
lv.prop('awning_red', drawn(6.5), 21.56)
lv.prop('awning_blue', drawn(35.5), 21.56)

lv.area('liquor store')
lv.prop('neon_sign_liquor', 4.0, 21.09)
lv.alarm(3, 17, 8, 19, 4.87, 21.1)
# (the user, 2026-11-19: "the shops lack detail": a shop is its stock, kind by kind, and what a day of customers leaves)
lv.prop('bottle_shelf', 5.0, 17.2)                      # spirits along the back wall ...
lv.prop('wine_rack', 6.3, 17.2)                         # ... and the wine, lying in its rack
lv.prop('ladder', 3.5, 16.5)                            # up to the roof
lv.prop('bottle_shelf', 8.3, 17.2)                      # behind the counter
lv.prop('bar_counter', 7.5, 18.4, clutter='liquor_counter')   # a bottle being priced, the ledger
lv.prop('bar_counter', 8.5, 18.4, clutter='liquor_till')   # its till, the display left on, the day's slips, a full ashtray
lv.prop('shop_shelf', 5.0, 18.5)                        # the gondola in the middle: crackers, cans, what goes with a bottle
lv.prop('lottery_stand', 6.78, 18.42)                   # at the counter's end
# (nothing loose behind the counter nor in the aisle to the ladder: one vaults in there, and what he kicks along
# ends up at the ladder's foot: the QA robot's roof plans stopped on a crate of empties)
lv.prop('beer_cases', 4.25, 19.55)                      # beer by the case, by the fridges
lv.prop('cig_rack', 8.91, 17.7, 90)                     # the cigarettes, on the wall behind the till
lv.prop('price_board', 3.09, 17.6, 270)
lv.prop('security_mirror', 3.6, 19.91, 180)             # up in the corner by the window, facing the door
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
lv.prop('tv', 38.55, 18.8)                              # out of the way of the trapdoor in the back
lv.prop('vcr_shelf', 36.7, 17.2)                        # the video recorders, all blinking 12:00
lv.prop('bookshelf', 38.0, 17.2)                        # manuals, catalogues, boxed tapes
# the repair man's bench where the shop's desk was, against the east wall: a set open on its back, the iron left hot
lv.prop('repair_bench', 39.5, 18.1, 90)
lv.prop('tv_stack', 36.35, 18.5, 270)                   # the wall of sets, left on, facing the room
lv.prop('speaker', 36.3, 17.7)
lv.prop('tv_box', 37.0, 19.1)                           # two sets still in their boxes, behind the window's
lv.prop('tv_box', 37.76, 19.14, 90)
lv.prop('neon_tube_pink', 36.07, 18.5, 270)
lv.prop('tape_rack', 39.91, 19.3, 90)                   # tapes for rent, by the door
lv.prop('calendar', 36.09, 19.4, 270)

lv.area('laundromat')
lv.prop('neon_sign_wash', 25.55, 31.91)
lv.prop('washer', 27.4, 35.6, 180, seep='washer')       # the first one weeps at its foot (systems/Seeps.js)
for x in (28.12, 28.84):
    lv.prop('washer', x, 35.6, 180)
lv.prop('dryer', 31.6, 34.1, 90)                        # the two dryers on the east wall, one load still going round
lv.prop('dryer', 31.6, 34.82, 90)
# a man doing his laundry at 2 AM (ai/Pastimes.js laundry): his load out of the machine in front of him, each piece
# shaken out, folded and laid on the pile on the next machine's lid; his basket on the floor at his left
lv.patron('civ6', 28.84, 34.88, 90, 'laundry')
lv.prop('laundry_basket', 30.5, 35.45, 6)
lv.prop('bench', 28.3, 33.4, clutter='bench_wash')         # washing folded and left, the box of powder
lv.prop('trash_can', 31.6, 33.35, tips=False)            # indoors: stays up (the street's go over)
lv.prop('soap_vend', 31.5, 35.8, 180)                   # the soap machine in the corner
lv.prop('folding_table', 27.35, 34.4, 90)               # against the west wall, somebody's towels left on it
lv.prop('laundry_cart', 30.6, 34.88)
lv.prop('wet_sign', 27.95, 35.0, 20)                    # by the leak, for what good it does
lv.prop('notice_board', 27.09, 34.4, 270)
lv.prop('coin_changer', 31.5, 33.09)
lv.prop('wall_clock', 31.91, 33.42, 90)
lv.prop('tube_light', 28.5, 35.93, 180)
lv.prop('tube_light', 30.5, 35.93, 180)
# its floor: the drain, the way from the door to the machines, lint trodden about by them, the tide a leak left, a sock
# nobody came back for
lv.grime_at('drain', 30.35, 34.6, r=7)
lv.wear_path(30.5, 33.1, 28.3, 34.9, 9)
for (x, y) in ((27.75, 35.1), (30.5, 35.35), (31.05, 34.45), (30.2, 33.6)):
    lv.grime_at('lint', x, y)
lv.grime_at('tide', 28.5, 34.95)
lv.grime_at('scuffs', 28.1, 35.05)
lv.litter_at('sock', 30.9, 34.0, 20)                     # (all of it off the cut line at 29)
# what the years did to it: rust under the machine that leaks and the lime of its water gone across the tiles, mould in
# the corners nobody mops, cracked and chipped tiles, the wet soles in from the street, dust under the bench, lint
lv.grime_at('rust', 27.4, 35.6, w=23, h=23)
lv.grime_at('runoff', 27.4, 35.25, r=17, deg=270)
lv.grime_at('mould', 27.12, 35.2, r=7)
lv.grime_at('mould', 31.85, 33.15, r=6)
lv.grime_at('mould', 31.2, 35.9, r=5)
for (x, y) in ((30.4, 34.25), (28.3, 34.2)):
    lv.grime_at('crack', x, y, len=[16, 34], d=-30, lit=9, wide=0.3)
for (x, y) in ((27.9, 33.9), (30.95, 33.6), (28.6, 35.1)):
    lv.grime_at('chip', x, y)
lv.grime_to('prints', 30.5, 33.05, 30.3, 34.5, col='#2a3038')
lv.grime_at('dust', 28.3, 33.6, w=46, r=6)
for (x, y) in ((31.15, 34.1), (31.1, 34.85)):
    lv.grime_at('lint', x, y, r=7)
lv.grime_at('stain', 30.95, 35.5, col='#5a78a8')        # softener, under the soap machine

lv.area('service alley')
for x in (11.5, 12.5, 13.5):
    lv.prop('chain_fence', x, 20.88)                    # the gate, flush with the facade
lv.prop('wall_lamp', 11.09, 19.0, 270)
lv.prop('trash_can', 13.5, 17.4)
lv.prop('trash_can', 13.45, 18.25)
lv.prop('crate', 11.45, 16.9, -6)
lv.prop('parapet', 10.5, 12.5, 90)                     # the drop from the roof
lv.prop('dumpster', 11.62, 14.5, 90)
lv.prop('neon_tube_cyan', 13.93, 9.9, 90)
lv.prop('crate', 11.45, 9.8, 4)
lv.prop('gas_bottle', 13.72, 6.55)                      # the stove's gas, against the bar's wall
lv.prop('gas_bottle', 13.7, 7.05)
lv.prop('pipe_steam', 13.93, 13.6, 90)                  # the bar's heating, along its wall: a round makes it whistle
lv.dress('manholes', 12.5, 10.6)
lv.prop('conduit', 13.94, 16.0, 90)                     # wiring along the bar's side wall
lv.paint('tag', 11.9, 12.6, 80)                         # a tag sprayed on the ground, half gone
lv.dress('papers', 11, 1, 13, 19, 4)

lv.area('back lot')
# the getaway: THE BOSS's convertible, roof down, its driver's door toward the lot (systems/Outro.js). 5.4 m of car
# in a 4 m lot with a 3 m alley out of it: its row and the route's first bend (exit_zone) are the only ones that
# get it round without touching a wall (tests/outro.test.mjs drives it); move neither without that test
lv.prop('convertible', 24.5, 2.7, 180, lights=False)
lv.prop('dumpster', 15.2, 1.6)
lv.prop('pallet', 17.55, 1.5)                           # the week's delivery, never brought in (off the getaway's way)
# the junk the bar never had taken away, along the far wall: a fridge, a washer, a dead TV, an armchair, a chair
lv.prop('fridge', 13.5, 1.42, -6, lights=False)          # dead: no light at its door
lv.prop('washer', 13.55, 2.25, 8)
lv.prop('tv', 16.55, 1.42, 12, lights=False)
lv.prop('armchair', 18.65, 1.5, 14)
lv.prop('trash_can', 21.0, 1.45)
lv.prop('trash_can', 21.6, 1.6)
lv.dress('beds', 18.1, 2.5, -12)                        # a flattened box by the armchair
lv.prop('barrel', 12.0, 1.45)
lv.prop('barrel', 12.65, 1.5)
lv.prop('trash_can', 31.5, 1.5)
lv.prop('parapet', 10.5, 3.5, 90)                      # the drop from the roof
lv.prop('crate', 32.4, 1.45, -8)
lv.prop('wall_lamp', 17.5, 4.91, 180)
# the house's fuse box, between the toilets' window and the back door: smash it and the bar is left in its emergency lighting
lv.power(14, 5, 31, 20, 24.5, 4.92, 180)
for (x, y, deg) in ((23.91, 15.5, 90), (20.5, 19.91, 180), (24.91, 17.4, 90),     # the bar room: the gaming room's wall
                                                                                # (where the arcade stood: the user's spot), front, VIP side
                    (17.6, 10.91, 180), (21.09, 8.5, 270), (25.4, 10.91, 180),   # storeroom, toilets, the boss's room
                    (28.5, 17.09, 0)):                                          # the VIP room
    lv.prop('emergency_light', x, y, deg)
lv.prop('wall_vent', 16.3, 4.92, 180)                   # the oven's extractor steams into the lot
lv.prop('pipe_water', 20.2, 1.07)
lv.dress('papers', 14, 1, 32, 4, 4)
lv.prop('tube_light', 26.55, 4.93, 180)                 # beside the back door (a body on the wall: over it, it
                                                        # barred the doorway)
lv.prop('gas_bottle', 30.4, 4.74)
lv.prop('conduit', 20.9, 4.94, 180)                     # the house's wiring along its back wall (off the cut line)

lv.area('storeroom')
lv.prop('steel_shelf', 15.7, 6.22)                      # catering tins, napkins, a coil of beer line
lv.prop('hand_truck', 16.56, 6.42)                      # stood between the shelving and the stove
lv.prop('oven', 17.1, 6.38, seep='pot')                 # something left to simmer on it: it breathes steam
lv.prop('sink', 18.35, 6.3)
lv.prop('fridge', 18.62, 7.5, 90)
lv.prop('tube_light', 18.93, 8.6, 90)
lv.prop('dope_table', 17.0, 9.2, clutter='dope')                       # in the middle of the room, a way round it on every side
lv.prop('crate', 18.55, 10.55, 4)                       # the stock, in corners off every way round the table (behind
lv.prop('crate', 15.4, 6.85, 10)                        # it they made a pocket where two men jammed)
lv.prop('conduit', 15.06, 9.9, 270)                     # the wiring run down the west wall, south of the alley door
# the corner by the counter's door: the ice bin (it sweats on the concrete), the brooms on their hooks over it, a crate
# of empties by the stock; all against the walls (the ways round the table stay as they were)
lv.prop('ice_bin', 15.22, 10.5, 270)
lv.prop('cleaning_rack', 15.5, 10.91, 180)
lv.prop('bottle_crate', 18.0, 10.7)
lv.prop('calendar', 18.91, 9.5, 90)
lv.paint('cardboard_flat', 15.62, 8.5, 90)              # a flattened carton for a mat, inside the alley door

lv.area('toilets')
# an American restroom (the user): one stall in the north-east corner, its partition on chrome feet and a swinging
# door, clear of the window's foot (one dives in from the back lot); the urinals on the west wall, the sink on the east
lv.prop('toilet', 23.5, 6.4)
lv.prop('stall', 23.06, 6.78)                           # the stall's side, from the wall to its front
lv.leaf(23.1, 7.57, 0, 24)                              # its door, hinged on the partition, shut across the front
for y in (7.95, 8.85):
    lv.prop('urinal', 21.19, y, 270)                    # on the west wall
lv.prop('sink', 23.7, 9.0, 90)
lv.prop('tube_light', 23.93, 8.15, 90)                  # between the stall and the sink
lv.prop('trash_can', 21.4, 10.5, tips=False, flies=True)    # two flies over it
# the mop bucket left in the corner by the door, grey water to its rim (shoved, it slops over: systems/Seeps.js), the
# sign somebody put out, the hand dryer that never worked, what gets written on the walls
lv.prop('mop_bucket', 23.6, 10.55)
lv.prop('wet_sign', 23.3, 9.98, -15)
lv.prop('hand_dryer', 23.93, 10.25, 90)
lv.prop('graffiti', 21.07, 9.9, 270)
lv.prop('graffiti', 21.5, 6.07)

lv.area('back room')
lv.prop('table_lamp', 25.45, 7.35)
lv.prop('desk', 27.6, 6.75, 270, clutter='cueball_desk')                       # its seat side toward the boss, up against the north wall
lv.prop('sofa', 25.5, 8.6, 270)
lv.prop('armchair', 28.48, 6.45, 180)                   # the boss's, pulled up to his desk so that his boots rest on
                                                        # it (the user), its back flush with the north wall: no pocket
                                                        # north of it to get caught in (the QA robot found him there)
lv.prop('table_round', 27.6, 8.75, clutter='men_table')                    # the boss's men's table, 1.2 m off the couch: the way from the
lv.prop('chair', 28.45, 8.75, 180)                      # back door to the rest of the room goes round it
lv.prop('chair', 27.6, 9.57, 270)
lv.prop('ceiling_lamp', 27.6, 8.75)
lv.prop('floor_lamp', 25.4, 10.55)
lv.prop('cash_case', 30.2, 10.45, 84, clutter='cash_floor')                  # the boss's takings, open on the floor in front of the man
                                                        # who counts them
lv.prop('extinguisher', 25.9, 10.86, 180)              # on the wall by the door
# an office after all: the safe in the corner behind him (nothing here opens it), the files by the couch, a clock, the
# garage's calendar; all flush with a wall, off the two ways across the room
lv.prop('safe', 30.62, 6.38)
lv.prop('filing_cabinet', 25.32, 10.05, 270)
lv.prop('wall_clock', 26.92, 6.08)
lv.prop('calendar', 30.92, 9.5, 90)
# the carpet trodden from the back door to the door of the gaming room, between the couch and the men's table, and
# worn where the man on the couch rests his heels and under the boss's boots at his desk
lv.wear_path(26.4, 6.3, 26.75, 10.2, 9)
lv.grime_at('wear', 26.4, 9.9, r=9, d=5, grey=0.2)
lv.grime_at('wear', 29.5, 6.9, r=8, d=5, grey=0.2)

lv.area('the bar: counter along the north wall')
# Walkways (the user: "no room to get through"): a man is drawn 26 px wide, so about 1.2 m of clear floor along every
# way across the room. Behind the counter 1.25 m (one squeezes past the bartender); between a customer on a stool and
# the booths and the card game 1.2 m, the whole of row 15; from the front door a lane 1.5 m wide up to it, the card
# game on its left, the jukebox on its right; the middle of the room left clear (a high table there was "useless"). The men at the
# counter, the cards, the dope and the money stand square at what they work at (data/posts.js `front`).
# what stands on it, module by module (data/clutter.js SETS): napkins and peanuts, the regulars' glasses and ashtrays,
# the bottle the bartender pours from, the till at his end
for x, things in ((15.5, 'counter_rack'), (16.5, 'counter_regular'), (17.5, 'counter_middle'), (18.5, 'counter_pour'),
                  (20.5, 'counter_phone')):              # (no module on the cut line)
    lv.prop('bar_counter', x, 13.85, clutter=things)
for x in (15.65, 16.75, 17.85, 18.95):
    lv.prop('chair', x, 14.5, 270)
for x in (17.59, 20.41):                                # the bottles: racked on the wall, either side of the
    lv.prop('back_bar', x, 12.16)                       # bartender and of the neon over his head
lv.prop('neon_sign_bay', 18.5, 12.09)                  # the town's lager in neon over the bartender's head
for x in (16.3, 18.0, 20.7):
    lv.prop('ceiling_lamp', x, 13.85)
lv.prop('keg', 15.36, 12.45)                            # two kegs of draught in the corner behind the counter: holed,
lv.prop('keg', 15.36, 13.02, seep='keg')                # they flood it with beer, and whoever runs on it goes down; the
#                                                       one on tap weeps at its coupling (systems/Seeps.js)
lv.paint('bar_mat', 17.3, 12.95)                        # the duckboard the bartender walks, between the door and the cut
for x in (15.95, 17.15):                                # their taps on the bar, the bartender's side of it
    lv.prop('beer_tap', x, 13.62)

lv.area('the bar: the main room')
# 8 x 8 m: the counter along the north wall, the pool table in the middle with a cue's length round it, a booth on the
# west wall, the arcade in the corner between the toilets' and the gaming room's doors and the jukebox by the door;
# 1.2 m and more of floor along every way across, the lane from the front door to the toilets' door clear, the foot of
# the street windows clear (one dives in onto open floor); a table to slide over everywhere one runs.
lv.prop('pool_table', 20.8, 16.9, clutter='pool_rail')  # a beer and a smoking ashtray on its rail
lv.prop('pool_lamp', 20.8, 16.9)
lv.prop('sofa', 15.5, 17.0, 270)
lv.prop('wall_lamp', 15.09, 17.0, 270)
lv.prop('table', 16.5, 17.0, 90, clutter='booth')
lv.prop('arcade', 23.35, 12.47, 0)                      # in the corner between the toilets' and the gaming room's
                                                        # doors, its back to the north wall (the user); clear of both
                                                        # doors' swing, its player off the way to them
lv.prop('jukebox', 23.6, 19.6, 180)
lv.prop('ceiling_fan', 22.6, 14.2)
lv.prop('plant', 17.85, 19.55)                          # in the corner by the windows
lv.prop('extinguisher', 23.88, 14.5, 90)                # on the gaming room's wall
lv.prop('cig_machine', 23.62, 16.0, 90)                 # the cigarette machine, between the red lamp and the dartboard

lv.area('the bar: the gaming room')
# 5 x 4 m behind its door: poker under a green-shaded lamp, the dealer at the west end with the
# house's pistol, his players across from the boss's door (kept clear: one comes in from the back room), an empty
# chair at the east end, the money in its case, the bottles on a shelf; the window's foot on the gap left clear.
lv.prop('card_table', 26.9, 14.25, clutter='poker')
lv.prop('pool_lamp', 26.9, 14.25)
lv.prop('chair', 26.5, 15.25, 270)
lv.prop('chair', 27.4, 15.25, 270)
lv.prop('chair', 28.35, 14.25, 180)
lv.prop('bottle_shelf', 25.9, 12.16)
lv.prop('cash_case', 28.8, 12.6, 15, clutter='cash_floor')
lv.prop('wall_lamp', 30.91, 13.0, 90)
lv.prop('water_cooler', 30.7, 12.32)                    # in the corner past the money: its tap never quite shuts
lv.prop('coat_rack', 25.3, 15.65)                       # the players' coats, behind the dealer
# years of games: the carpet's pile trodden flat in a ring round the table where the chairs are pulled in and out, a
# card and two chips gone under it and never picked up
lv.grime_at('halo', 26.9, 14.25, r=35, w=7, d=-9, grey=0.2)
lv.litter_at('card', 28.05, 15.4, 35)
lv.litter_at('chip', 28.3, 15.15)
lv.litter_at('chip', 25.95, 15.55)

lv.area('the bar: what can be used')
# the fire alarm east of the counter, by the toilets' door: pulled, it rings, the sprinklers rain on the bar room, the floor is slick, the
# customers run (systems/Sprinklers.js)
lv.sprinklers(21.5, 12.07, 0, [(15, 12, 30, 19)])
# under the street: a trapdoor in the TV shop's back, the other under the rug inside the back room's door
lv.passage(('trapdoor', 37.55, 17.95, 0), ('rug', 26.75, 10.35, 0))

lv.area('the bar: VIP room')
# 4 x 3 m behind the velvet (2 AM, the user: "more details on the floor, like banknotes"): the dancer's stage at the east
# end, the sofa along the north wall with a low table in the corner at its end, the armchair by the door; the way in
# from the curtain (row 18) and the window's foot on the gap (north-east corner) clear
lv.prop('curtain', 25.5, 18.5)                          # velvet across its doorway: walked through, never seen through
lv.prop('dance_stage', 30.0, 18.9, clutter='stage')    # banknotes thrown at the dancer, a few tucked in its brass edge
lv.prop('mirror_ball', 28.5, 18.6)                      # its specks turn round the room
lv.prop('sofa', 28.15, 17.45, clutter='vip_sofa')                         # clear of where one lands diving through the window
lv.prop('cocktail_table', 26.5, 17.47, clutter='vip_table')  # champagne on ice, flutes, singles, a cigarette burning
lv.prop('armchair', 26.5, 19.45, 0, clutter='vip_armchair')
lv.prop('neon_tube_pink', 28.0, 19.93, 180)
# on its walls: a strip of mirror behind the stage, red neon lips beside it, a pin-up over the sofa, a revue's bill
# over the armchair (none across the doorway)
lv.prop('mirror_strip', 30.91, 18.95, 90)
lv.prop('neon_sign_lips', 30.64, 19.91, 180)
lv.prop('poster_pinup', 27.75, 17.09)
lv.prop('poster_revue', 26.09, 19.5, 270)
# what the night left on its carpet (systems/Litter.js: kicked, blown by a shot, lifted by the rounds): bills thrown at
# the dancer lying thickest round the stage's edge, a few by the sofa, the feathers her boa shed on the side the
# customers sit, a flute knocked over by the armchair and one by the stage, the corks, a garter, an ashtray put down by
# the sofa's foot
lv.litter_at('flute', 27.2, 19.2, 115)
lv.litter_at('flute', 28.12, 18.3, 200)
lv.litter_at('cork', 27.95, 18.55, 0)
lv.litter_at('cork', 28.1, 19.78, 0)
lv.litter_at('garter', 28.4, 19.55, 30)
lv.litter_at('ashtray', 27.05, 18.03, 0)
lv.litter('bill', 30.0, 18.9, 27, 60, 26, looks=(5, 3, 2), seed=1712)
lv.litter('bill', 27.3, 18.12, 0, 13, 5, looks=(4, 4, 1), seed=1713)
lv.litter('feather', 30.0, 18.9, 27, 42, 6, looks=(1, 1), arc=(130, 235), seed=1714)

lv.area('the bar: on its walls')
# pictures and posters behind glass, the dartboard, the coin phone, the coats on their hooks, a beer neon in the poker
# room (the wall at their back; never across a doorway, levelkit check_on_wall; none on the cut lines)
lv.prop('coat_hooks', 15.09, 15.3, 270)                 # by the end of the counter, on the west wall
lv.prop('frame_photo', 15.09, 16.2, 270)                # over the booth, either side of its lamp
lv.prop('poster_fight', 15.09, 17.85, 270)
lv.prop('poster_band', 20.3, 19.91, 180)                # on the front wall, between the windows and the door
lv.prop('dartboard', 23.91, 16.55, 90)                  # on the poker room's wall, past the red emergency light
lv.prop('pay_phone', 24.91, 19.35, 90)                  # by the jukebox, on the VIP room's wall
lv.prop('neon_sign_beer', 30.0, 12.09)                  # the poker room
lv.prop('frame_gold', 25.09, 15.4, 270)
lv.prop('frame_photo', 30.2, 15.91, 180)
lv.prop('frame_gold', 26.5, 17.09)                      # the VIP room, by the sofa
lv.prop('frame_photo', 25.09, 8.6, 270)                 # the boss's room: over his couch, his coats by the back door
lv.prop('coat_hooks', 26.35, 6.09)
lv.prop('towel_dispenser', 23.93, 9.8, 90)              # the toilets, by the sink

# the life of the rooms on their floors, kept faint (render/FloorWear.js): rings and dried spills by the counter and the
# tables, butts and peanut shells under the stools, napkins; the way from the door to the counter and to the toilets
# worn pale; paper towels under the sink
lv.grime('rings', 15, 14, 20, 15, 4)
lv.grime('sticky', 15, 14, 20, 15, 3)
lv.grime('butts', 15, 14, 20, 15, 5)
lv.grime('shells', 15, 14, 20, 15, 6)
lv.grime('napkin', 15, 14, 20, 15, 2)
lv.grime('sticky', 15, 12, 20, 13, 2)
lv.grime('rings', 15, 12, 20, 13, 2)
lv.grime('butts', 15, 16, 17, 18, 2)
lv.grime('sticky', 15, 16, 17, 18, 1)
lv.grime('napkin', 15, 16, 17, 19, 1)
lv.grime('butts', 18, 15, 23, 19, 4)
lv.grime('sticky', 19, 15, 23, 18, 2)
lv.grime('butts', 25, 12, 30, 15, 4)
lv.grime('burns', 25, 12, 30, 15, 2)
lv.grime('sticky', 25, 13, 30, 15, 1)
lv.grime('sticky', 26, 17, 30, 19, 2)
lv.grime('butts', 26, 17, 30, 19, 2)
# the VIP room: the pile worn flat in a ring round the stage, glitter shed by the dancer, butts and rings by the sofa,
# the champagne of the knocked-over flute dried sticky (each mark at its point: the other rooms' marks do not move)
lv.grime_at('halo', 30.0, 18.9, r=31, w=9, d=-14, grey=0.25)
for (x, y) in ((28.85, 18.25), (28.7, 19.2), (28.95, 19.8), (28.2, 18.6), (27.6, 18.15), (30.6, 19.85)):
    lv.grime_at('glitter', x, y, r=10)
for (x, y) in ((26.3, 18.2), (27.4, 18.15), (27.9, 18.8)):
    lv.grime_at('butts', x, y)
for (x, y) in ((27.0, 18.3), (28.4, 18.05)):
    lv.grime_at('rings', x, y)
lv.grime_at('sticky', 27.4, 19.3, col='#a89048')
lv.grime('butts', 25, 6, 30, 10, 4)
lv.grime('burns', 25, 6, 30, 10, 2)
lv.grime('napkin', 22, 8, 23, 10, 4)
lv.grime('stain', 23, 8, 23, 10, 1, col='#3a4a50')
lv.grime('butts', 21, 6, 23, 10, 2)
lv.grime('butts', 15, 6, 18, 10, 2)
lv.grime('sticky', 15, 7, 18, 10, 1)
lv.wear_path(21.5, 19.5, 17.8, 15.1)
lv.wear_path(21.5, 19.5, 22.4, 12.3, 10)
# the stools' feet and the heels hooked on the rail, along the counter's front; the toilets: the drain in the middle of
# its floor, the damp round it, the way from the door to the urinals; the storeroom's drain under the sink's corner and
# the way the stock goes, from the alley door to behind the counter; the liquor store: the way from its door to the
# till, heels along the counter
for x in (15.65, 16.75, 17.85, 18.95):
    lv.grime_at('scuffs', x, 14.75, k=2.2)
lv.grime_at('drain', 22.45, 9.3)
lv.wear_path(22.5, 10.9, 21.8, 8.4, 8)
lv.grime_at('drain', 18.0, 7.45, r=7)
lv.wear_path(14.9, 8.5, 16.5, 10.7, 9)
lv.wear_path(8.5, 19.8, 7.6, 19.1, 9)
lv.grime('scuffs', 6, 19, 8, 19, 2)
lv.grime('stain', 3, 17, 8, 19, 2, col='#3a3020')

# ---- what years of nights left on the floors of the house and of its neighbours (the user, 2026-11-19: "cracks,
# grime, as detailed as the street"). Each mark where it has a reason to be, at its point (render/FloorWear.js: the
# kinds mould, dust, drips, rust, prints, runoff are the rooms' own), none on a cut line.
lv.area('floors')
# the liquor store: dust under the shelves' fronts, the fridges' condensation and their rust, lino cracked and torn on
# the way to the till, a bottle that leaked all the way to the door, the street's dirt walked in
for (x, y) in ((5.0, 17.42), (6.3, 17.42), (5.0, 18.72)):
    lv.grime_at('dust', x, y, w=36, r=5)
lv.grime_at('rust', 3.4, 18.5, w=23, h=23)
lv.grime_at('runoff', 3.78, 18.9, r=14, deg=0)
for (x, y) in ((6.4, 18.9), (4.6, 17.9), (7.9, 19.3)):
    lv.grime_at('crack', x, y, len=[14, 34], d=-26, lit=7, wide=0.3)
lv.grime_at('tear', 6.9, 18.95)
lv.grime_at('tear', 4.1, 17.75)
lv.grime_to('drips', 5.9, 18.95, 8.25, 19.7, col='#3a2208')
lv.grime_to('prints', 8.5, 19.85, 7.2, 19.0)
lv.grime_at('sticky', 5.9, 18.95)
lv.grime_at('butts', 8.2, 19.55)
# the TV shop: the carpet trodden from the door to the bench and before the wall of sets, coffee by the bench, dust
# along the shelves, a burn where the iron fell
lv.wear_path(39.5, 19.6, 38.85, 18.4, 9)
lv.grime_at('wear', 37.1, 18.5, r=10, d=5, grey=0.2)
lv.grime_at('stain', 38.8, 18.0, col='#2a1808')
lv.grime_at('burns', 38.9, 18.6)
for (x, y) in ((36.7, 17.42), (38.0, 17.42)):
    lv.grime_at('dust', x, y, w=36, r=5)
lv.grime_to('prints', 39.5, 19.8, 38.6, 19.2)
# the bar room: where the stools drag, a board stove in by the pool table, burns round it and by the booth, the keg's
# beer dried black behind the counter and dripped along its back, wet soles out of the toilets and the street's in
# from the door, the corners nobody sweeps, the floor worn bare before the jukebox, the arcade and the darts
for x in (15.65, 16.75, 17.85, 18.95):
    lv.grime_at('scratches', x, 14.95)
lv.grime_at('broken', 18.3, 18.75)
lv.grime_at('broken', 22.6, 15.2)
for (x, y) in ((16.4, 15.7), (20.6, 15.4), (22.9, 18.3), (17.6, 19.2), (21.2, 14.2), (16.2, 12.7)):
    lv.grime_at('split', x, y, len=[26, 70], d=-30)        # boards split along their grain
for (x, y) in ((18.2, 15.9), (22.4, 17.6), (20.4, 18.9)):
    lv.grime_at('gap', x, y)
for (x, y, col) in ((17.9, 17.5, '#2a1808'), (21.9, 15.0, '#2a1808'), (16.0, 18.9, '#1a1410'), (20.3, 13.1, '#2a1a08')):
    lv.grime_at('stain', x, y, col=col, d=-11)             # what was spilt and mopped a hundred times
for (x, y) in ((20.2, 18.0), (22.3, 16.3), (17.2, 16.4), (16.9, 18.0)):
    lv.grime_at('burns', x, y)
lv.grime_at('stain', 15.75, 13.2, col='#2a1a08', d=-9)
lv.grime_to('drips', 15.7, 13.15, 17.3, 13.3, col='#3a2208')
lv.grime_to('prints', 22.5, 12.2, 22.2, 13.9, col='#2a3038')
lv.grime_to('prints', 21.9, 19.85, 21.5, 18.1)
lv.grime_at('dust', 15.45, 19.86, w=24, r=5)
lv.grime_at('dust', 23.6, 19.2, w=22, r=4)
for (x, y) in ((23.6, 18.95), (23.35, 13.25), (22.95, 16.55)):
    lv.grime_at('wear', x, y, r=9, d=6, grey=0.22)
lv.grime_at('stain', 23.1, 16.0, col='#1a1410')         # under the cigarette machine's front
# the toilets: mould in the corners and along the urinals' foot, what runs down under the sink and the urinals, piss on
# the tiles, cracked tiles, the wet walked to the door
for (x, y, r) in ((21.15, 6.15, 7), (23.85, 10.85, 6), (21.3, 8.4, 5), (23.8, 6.15, 5), (21.15, 10.85, 5)):
    lv.grime_at('mould', x, y, r=r)
lv.grime_at('runoff', 23.4, 9.0, r=14, deg=180)
for y in (7.95, 8.85):
    lv.grime_at('runoff', 21.32, y, r=9, deg=0)
    lv.grime_at('stain', 21.65, y + 0.05, col='#8a8030', d=-4)
for (x, y) in ((22.3, 7.2), (22.9, 10.2), (21.7, 9.6)):
    lv.grime_at('crack', x, y, len=[18, 40], d=-32, lit=9, wide=0.3)
for (x, y) in ((22.6, 8.3), (21.9, 10.5)):
    lv.grime_at('chip', x, y)
lv.grime_to('prints', 23.2, 9.35, 22.55, 10.85, col='#3a4a50')
lv.grime_at('tide', 22.45, 9.3)
# the storeroom: fat by the stove, the sink's leak, the fridge's rust, the bin bags dripped from the fridge to the
# alley door, the alley's dirt walked in, mould in the corner over the sink, dust under the shelving, powder by the table
lv.grime_at('grease', 17.1, 7.0, r=11)
lv.grime_at('runoff', 18.35, 6.75, r=11, deg=90)
lv.grime_at('rust', 18.62, 7.5, w=23, h=23)
lv.grime_to('drips', 18.1, 7.95, 15.2, 8.5)
lv.grime_to('prints', 15.1, 8.6, 16.3, 10.3)
lv.grime_at('mould', 18.85, 6.15, r=6)
lv.grime_at('dust', 15.7, 6.5, w=36, r=5)
lv.grime_at('stain', 17.95, 9.75, col='#e8e4dc', d=7)
lv.grime_at('stain', 18.2, 10.3, col='#2a1a08')
for (x, y) in ((16.2, 7.6), (17.6, 10.3)):
    lv.grime_at('crack', x, y, len=[24, 56], d=-26, lit=6, wide=0.3)
# the boss's room: what was scrubbed out of the carpet by the rug and never quite went, whisky by the couch, the pile
# trodden round the men's table, the lot's dirt in from the back door, dust behind the files
lv.grime_at('stain', 26.3, 9.95, col='#3a1418', d=-9)
lv.grime_at('stain', 26.15, 8.3, col='#2a1808')
lv.grime_at('halo', 27.6, 8.75, r=21, w=6, d=-8, grey=0.2)
lv.grime_to('prints', 25.5, 6.1, 26.3, 7.7)
lv.grime_at('dust', 25.2, 10.36, w=18, r=4)
for (x, y) in ((27.0, 9.6), (28.3, 9.3)):
    lv.grime_at('burns', x, y)
# the gaming room and the VIP room: the cooler's drips, whisky under the shelf, burns by the chairs; champagne and burns
lv.grime_at('runoff', 30.7, 12.6, r=9, deg=90)
lv.grime_at('stain', 26.0, 12.6, col='#2a1808')
lv.grime_at('dust', 25.9, 12.38, w=36, r=4)
for (x, y) in ((27.9, 15.5), (26.1, 15.7), (28.6, 13.6)):
    lv.grime_at('burns', x, y)
for (x, y) in ((27.6, 19.6), (28.7, 18.4)):
    lv.grime_at('burns', x, y)
lv.grime_at('stain', 26.9, 18.7, col='#a89048', d=-4)
# the gap and the two back doors (no body there: the gap has no room, the alley and the lot are the getaway's): the
# damp under the bar's windows, a drain, a carton somebody slept on, the butts of who smokes by each door, the bin
# bags dripped from the storeroom's door to the dumpster
lv.paint('drain', 32.5, 12.2)
lv.paint('cardboard_flat', 32.5, 7.6, 90)
for y in (14.5, 17.5):
    lv.grime_at('runoff', 32.05, y, r=12, deg=0)
lv.grime_at('tide', 32.5, 10.0)
lv.grime_at('butts', 32.4, 18.9)
for (x, y) in ((27.3, 4.35), (29.6, 3.45), (26.6, 4.65), (12.4, 8.9), (12.75, 8.35)):
    lv.grime_at('butts', x, y)
lv.grime_to('drips', 13.8, 8.6, 12.2, 13.7)
lv.grime_at('stain', 12.3, 13.9, col='#1a1410')

# the smoke of the night hanging under the lamps over the pool and the poker tables, and over the counter
lv.smoke_haze(20.8, 16.9, 2.3, 0.1)
lv.smoke_haze(26.9, 14.25, 1.9, 0.1)
lv.smoke_haze(17.6, 13.6, 2.0, 0.05)
lv.smoke_haze(30.0, 18.9, 1.4, 0.12)                     # thicker in the stage's light

# ---------------------------------------------------------------- rooftops of the neighbouring buildings
lv.area('the liquor store roof')
lv.prop('wall_lamp', 9.91, 11.4, 90)                    # a lamp by each way down
lv.prop('wall_lamp', 9.91, 4.6, 90)
# somebody's summer evenings, against the north wall: a couch from the street, a crate for a table, a radio
lv.prop('string_lights', 4.0, 9.3)
lv.prop('sofa', 3.9, 8.5)
lv.prop('crate', 3.9, 9.75, 12)
lv.prop('chair', 2.7, 9.95, 160)
lv.prop('chair', 5.1, 10.05, 25)
lv.prop('speaker', 5.45, 8.4)
lv.prop('plant', 1.45, 8.5)
lv.prop('plant', 6.2, 8.45)
lv.prop('floor_lamp', 2.5, 8.45)
# the building's plant: the water tank, the air conditioning of the shop, vents, the heating pipe along the edge
lv.prop('water_tank', 6.9, 12.2)
lv.prop('ac_unit', 9.47, 9.6, 90)
lv.prop('roof_vent', 8.35, 8.5)
lv.prop('roof_vent', 9.4, 8.45)
lv.prop('roof_vent', 5.3, 12.7)
lv.prop('wall_vent', 7.4, 8.08)                         # the neighbours' kitchen steams over the roof
lv.prop('pipe_steam', 6.5, 14.93, 180)
lv.prop('crate', 1.5, 12.2, -8)                         # stores nobody came back for
lv.prop('crate', 1.45, 11.45, 20)
lv.prop('trash_can', 2.3, 12.5)
lv.prop('barrel', 8.5, 13.6)
lv.dress('beds', 2.7, 13.75, 8)                         # and a flattened box somebody slept on
# the north arm, over the back lot: the bar's air conditioning, and a chair for whoever keeps an eye on the lot
lv.prop('ac_unit', 7.53, 5.0, 90)
lv.prop('roof_vent', 7.4, 3.5)
lv.prop('trash_can', 7.5, 6.5)
lv.prop('crate', 9.5, 6.3, 5)
lv.prop('chair', 9.3, 4.4, 80)
lv.prop('wall_vent', 8.4, 3.08)
lv.actor('5', 4, 11)                                    # a bat left against the crate
lv.drop('pistol', 8.62, 4.72, 205)                      # the liquor store's pistol, hidden up here by the lookout's chair
lv.dress('papers', 1, 8, 9, 14, 3)

lv.area('west block, round the roof')
lv.roof('skylight_dark', 3.2, 1.75)
lv.roof('tank', 3.2, 4.3)
lv.roof('vent', 5.3, 2.4)
lv.roof('vent', 5.3, 3.4)
lv.roof('chimney', 1.5, 5.6)
lv.roof('antenna', 4.9, 5.75, 20)

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
lv.roof('hatch', 34.5, 14.3)
lv.roof('bulkhead', 37.0, 14.1, 180)
lv.roof('antenna', 41.6, 14.4, -15)
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
lv.roof('vent', 17.6, 33.6)
lv.roof('vent', 17.6, 37.3)

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

# by the driver's door of the boss's convertible: he vaults in and tears off (systems/Outro.js). Its way out (the
# path of the point OUTRO.pivot ahead of its middle): west along the back lot, round into the service alley (too
# tight to slide: `slide` 0; the two barrels of the lot's corner are in its way), down the alley over what stands in
# it, through the gate, across the pavement and out wide onto the road, tail out, then away west in the westbound
# lane. `fade`: tiles before the end where the picture goes black.
exit_zone = {'x': 23.4, 'y': 4.55, 'r': 1.3, 'route': [[12.6, 3.4], [12.6, 27.0], [-9, 26.2]], 'radius': [3, 3], 'slide': [0, 1],
             'fade': 14}

if __name__ == '__main__':
    lv.check(guards=12)
    lv.write('level1', name='NO LOOSE ENDS', subtitle='SUNSET BAY  -  MARCH 15TH 1986  -  2:14 AM', exit=exit_zone,
             objective=['CLEAN OUT THE BAR', 'GET TO THE VAN IN THE BACK LOT'],
             lights=lights, ambient=ambient, header=[
                 'Level 1 - "NO LOOSE ENDS": an alley, a road, the MIRAGE bar, its back room, and the way out through the back lot.',
                 'Ways in: the front door, the chain-link gate of the service alley (west), the dark gap behind the',
                 'anonymous door right of the bar (east), the liquor store and its roof (far west), three windows.',
                 'Lit shop fronts on the street: liquor, TV, laundromat.',
             ])
