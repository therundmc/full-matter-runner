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
They are public ground. The liquor store has a ladder to its roof in its back wall.

Six ways in, none of them free (the level is made to be played again another way):
    the front    double door under the neon: the bouncer, the sidewalk patrol, the whole room at once
    the gate     west service alley, closed by a chain-link gate to climb (Space): the shortest way to the back, but
                 under a lamp, in full view of the street through the mesh, with a man smoking a few metres further
    the gap      an anonymous door right of the bar opens on a dark one-metre gap: nobody posted there and no light,
                 but it is the long way round, with no room to dodge, past a window of the bar, and it comes out
                 in the back lot under the tube light by the back door, where a guard leans smoking; on its way, a window of the
                 VIP room to dive through
    the roof     a fire-escape ladder at the corner of the liquor store (far left of the street) climbs to its flat
                 roof: nobody up there, a bat left by whoever comes to smoke, and two drops over the parapet: into
                 the service alley behind the gate and the smoker's back, or into the west end of the back lot
    the shop     the liquor store: break in by the front (the bell rings, the guards come and look: a diversion as
                 much as a way in), or come down its own ladder from the roof without a sound; the pistol is behind
                 the counter, and the same ladder is the way on from there
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
lv.put(25, 5, 'L')             # back room -> back lot, locked: the back way in has to be forced (at the west end of
                               # the wall: east of it the desk and his armchair leave only a doorway's width). No
                               # window in the boss's room (the user had it walled up)
lv.put(22, 5, 'G')             # the toilets' window on the back lot
lv.put(31, 17, 'G')            # the VIP room's window on the gap
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
# the liquor store's flat roof: up a ladder from the street corner or from the shop, down over a parapet
lv.fill(1, 8, 9, 14, '^')
lv.fill(7, 3, 9, 7, '^')       # its north arm, above the back lot
lv.fill(1, 15, 1, 20, '^')     # the fire escape's landing and its ladder on the street
lv.fill(3, 15, 3, 16, '^')     # the shop's own ladder, in its back wall
lv.put(10, 12, '^')            # the parapet over the service alley
lv.put(10, 3, '^')             # ... and over the back lot
lv.fill(5, 20, 7, 20, 'G')
lv.put(8, 20, 'L')
lv.fill(36, 17, 39, 19, ';')
lv.fill(36, 20, 38, 20, 'G')
lv.put(39, 20, 'L')
lv.fill(27, 33, 31, 35, '+')
lv.fill(27, 32, 29, 32, 'G')
lv.put(30, 32, 'D')

# ---------------------------------------------------------------- actors (14 guards)
# Blades, bats and a tire iron: twelve men with their hands. Two guns in the whole house: the pool player's pistol
# in the bar room, the boss's shotgun in the back room. One more for the taking, behind the liquor store's counter
# (it is closed: breaking in rings its bell). A pistol holds seven rounds, and nobody carries a spare magazine.
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
# customers hang about freely in the bar room and the toilets (not in front of the VIP door: the bouncer's spot)
lv.host(21, 12, 30, 12)
lv.host(15, 13, 30, 15)
lv.host(15, 16, 23, 19)
lv.host(21, 6, 23, 11)

# what each place sounds like (src/game/data/soundscape.js), the first that holds a tile wins; the street, the roofs and
# the rest under a roof need none. A dry night: no rain heard.
lv.sound_spot('window', 9, 31)            # a radio left on behind a window above the shops across the road
lv.sound('vip', 25, 17, 30, 19)          # the dancer's corner, its doorway on the bar room
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
lv.actor('b', 24, 21, face=90, job='door')                   # bouncer
lv.actor('J', 17, 22, route=[[16, 22], [27, 22]], job='beat')  # a blade in his pocket, walks the sidewalk
# the bar
lv.actor('b', 18, 12, face=90, job='wipe')                   # bartender, a bat under the counter
lv.actor('p', 25, 14, face=349, job='pool')             # playing pool: the one pistol of the bar room
lv.lean('cue', 25.6, 12.2, 270)                         # a cue stood against the wall by the pool table
lv.actor('k', 20, 16, face=90, job='cards')             # dealing at the card table
lv.actor('b', 24, 17, face=65, job='door')                   # bouncer of the VIP room, an eye on its door
# customers (civilians): they run for the street when it kicks off
lv.patron('civ1', 16.75, 14.5, 270, 'drink')            # on the counter stools
lv.patron('civ2', 15.6, 16.4, 0, 'drink')               # alone in the first booth
lv.patron('civ4', 18.7, 17.45, 0, 'cards')              # the poker game
lv.patron('civ5', 21.3, 18.05, 180, 'cards')
lv.patron('civ3', 30.15, 13.45, 180, 'cue')             # waiting for his turn at the pool table
lv.patron('civ8', 26.55, 17.5, 40, 'drink')             # the VIP room: two customers, a dancer
lv.patron('civ7', 26.55, 19.45, -27, 'watch')
lv.patron('dancer1', 30.0, 18.9, 180, 'dance')
# back of house
lv.actor('j', 17, 8, face=90, job='dope')               # the pimp, alone, weighing and bagging his dope
lv.actor('6', 18, 8)
lv.actor('k', 21, 9, face=0, job='piss')               # in the toilets: the bowl, the sink, a smoke against the wall
lv.actor('h', 30, 9, face=180, job='boss', look='boss')  # the boss in his armchair, feet up on the desk, the shotgun on it
lv.actor('m', 26, 9, face=0, job='couch')               # his two men on the couch: one reads,
lv.actor('i', 26, 10, face=0, job='couch')              # ... the other one plays with his tire iron
lv.actor('k', 28, 10, face=0, job='count')              # counting the night's banknotes by the boss's case
lv.actor('6', 32, 17)                                   # a blade someone dropped in the gap
lv.actor('1', 8, 17)                                    # what the liquor store keeps behind its counter
# back lot: one man, his back against the wall by the back door, smoking; now and then a look at the van
lv.actor('b', 27, 4, face=270, job='lean')
# the service alley: a man smoking against the bar's wall under the cyan tube, by the storeroom door
lv.actor('k', 12, 8, face=180, job='alley')

# ---------------------------------------------------------------- props
lv.area('the alley where it starts')
lv.prop('dumpster', 23.42, 35.0, 90)
lv.prop('trash_can', 20.45, 36.4)
lv.prop('trash_can', 20.5, 35.6)
lv.prop('trash_can', 23.3, 32.5)                        # on the cat's way out
lv.cat(23.4, 34.5)                                      # on the dumpster, watching him
lv.pigeons(16.5, 30.6, 3)
lv.prop('string_lights', 22.0, 33.9)
lv.prop('string_lights', 22.0, 36.1)
lv.prop('wall_lamp', 20.09, 33.6, 270, flicker='broken')   # over him, on its last legs

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
# the parking strip (rows 23-24) marked off from the westbound lane by a solid edge line, its bays painted across it:
# with it the road reads as two equal lanes either side of the centre line, plus the strip (the user). Positions are
# worked out in the level's columns (after the cuts) and given back in the drawing's.
def drawn(col):
    return col + (2 if col >= 28 else 1 if col >= 19 else 0)


for i in range(14):
    lv.paint('road_edge', drawn(1.5 + 3 * i), 25.0)
for col in (2.0, 7.0, 12.1, 17.1, 22.1, 26.8, 31.6, 36.9, 41.9):
    lv.paint('parking_bay', drawn(col), 24.05, 90)
lv.prop('car2', 14.6, 24.0, 0, lights=False, trunk='tire_iron')   # E at its tail: a tire iron in the trunk
lv.prop('car', 31.2, 24.0, 180)
lv.prop('van', 36.3, 24.05, 180, lights=False)           # in its bay

lv.area('north sidewalk and the facade')
lv.prop('neon_sign_bar', 30.0, 21.09)
lv.prop('neon_sign_arrow', 9.6, 21.09)
# the club's door (the user wanted it like a strip club's: the wall lamps and the plain pots were "vile"; a pergola
# was tried before, "too ugly"): a red carpet to the kerb between brass posts and velvet ropes, a palm each side in a
# lacquered planter lit violet from below (a GIRLS neon was tried: "too much"); the bouncer at the east rope.
# The ropes stand clear of the sidewalk patrol's beat (row 22) and leave the carpet 1.9 m wide.
lv.paint('entry_carpet', 22.0, 21.94)
lv.prop('palm_planter', 20.62, 21.44)
lv.prop('palm_planter', 23.38, 21.44)
lv.prop('velvet_rope', 20.5, 22.0)
lv.prop('velvet_rope', 23.5, 22.0)
lv.prop('awning', 22.0, 21.78)                          # a canvas awning over the carpet (the user's wish; a wooden
                                                        # pergola had been "too ugly")
lv.prop('streetlight', 6.5, 22.7, 90)
lv.prop('streetlight', 35.5, 22.7, 90)
lv.prop('bench', 37.5, 22.62, 180)                      # on the kerb, facing the TV shop's window
lv.prop('trash_can', 40.5, 21.35)
lv.pigeons(33.3, 21.7, 2)
lv.prop('hydrant', 10.6, 22.65)                       # clear of the alley's mouth (bigger, it snagged whoever came out)
lv.prop('vending', 17.42, 21.33)                        # drinks machine against the bar's front
lv.prop('news_box', 26.6, 21.19)
lv.dress('papers', 0, 21, 43, 22, 9)
lv.dress('papers', 0, 23, 43, 29, 6)
lv.dress('manholes', 9.5, 25.2)
lv.dress('manholes', 27.3, 28.5)
lv.prop('wall_lamp', 2.35, 21.09)                       # by the foot of the fire escape: the ladder must be seen
lv.prop('palm_tree', 41.6, 21.8)

lv.area('liquor store')
lv.prop('neon_sign_liquor', 4.0, 21.09)
lv.alarm(3, 17, 8, 19, 4.87, 21.1)
for x in (5.0, 6.3):
    lv.prop('bottle_shelf', x, 17.2)
lv.prop('ladder', 3.5, 16.5)                            # up to the roof
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
for x in (27.4, 28.12, 28.84):
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
lv.prop('parapet', 10.5, 12.5, 90)                     # the drop from the roof
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
# the junk the bar never had taken away, along the far wall: a fridge, a washer, a dead TV, an armchair, a chair
lv.prop('fridge', 13.5, 1.42, -6)
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
for (x, y, deg) in ((23.6, 12.09, 0), (20.5, 19.91, 180), (24.91, 17.4, 90),     # the bar room: back, front, VIP side
                    (17.6, 10.91, 180), (21.09, 8.5, 270), (25.4, 10.91, 180),   # storeroom, toilets, the boss's room
                    (28.5, 17.09, 0)):                                          # the VIP room
    lv.prop('emergency_light', x, y, deg)
lv.prop('wall_vent', 16.3, 4.92, 180)                   # the oven's extractor steams into the lot
lv.prop('pipe_water', 20.2, 1.07)
lv.dress('papers', 14, 1, 32, 4, 4)
lv.prop('tube_light', 26.55, 4.93, 180)                 # beside the back door (a body on the wall: over it, it
                                                        # barred the doorway)
lv.prop('gas_bottle', 30.4, 4.74)

lv.area('storeroom')
lv.prop('bookshelf', 15.7, 6.2)
lv.prop('oven', 17.1, 6.38)
lv.prop('sink', 18.35, 6.3)
lv.prop('fridge', 18.62, 7.5, 90)
lv.prop('tube_light', 18.93, 8.6, 90)
lv.prop('dope_table', 17.0, 9.2)                        # in the middle of the room, a way round it on every side
lv.prop('crate', 18.55, 10.55, 4)                       # the stock, in corners off every way round the table (behind
lv.prop('crate', 15.4, 6.85, 10)                        # it they made a pocket where two men jammed)

lv.area('toilets')
lv.prop('toilet', 21.5, 6.4)
lv.prop('toilet', 23.4, 6.4)
for x in (22.07, 22.93):                                # a partition each side of the window bay: one lands between
    lv.prop('stall', x, 6.68)                           # them diving through it
for y in (7.95, 8.85):
    lv.prop('urinal', 21.19, y, 270)                    # on the west wall
lv.prop('sink', 23.7, 9.0, 90)
lv.prop('tube_light', 23.93, 7.7, 90)
lv.prop('trash_can', 21.4, 10.5)

lv.area('back room')
lv.prop('table_lamp', 25.45, 7.35)
lv.prop('desk', 27.6, 6.75, 270)                        # its seat side toward the boss, up against the north wall
lv.prop('sofa', 25.5, 8.6, 270)
lv.prop('armchair', 30.45, 6.6, 180)                    # the boss's, behind his desk, in the corner: no pocket
                                                        # north of it to get caught in (the QA robot found him there)
lv.prop('table_round', 27.6, 8.75)                      # 1.2 m off the couch: its men get up and out, and that is
lv.prop('chair', 28.45, 8.75, 180)                      # the way from the back door to the rest of the room; 0.85 m
lv.prop('chair', 27.6, 9.57, 270)                       # under the desk, to the boss's corner
lv.prop('ceiling_lamp', 27.6, 8.75)
lv.prop('floor_lamp', 25.4, 10.55)
lv.prop('cash_case', 30.2, 10.45, 84)                   # the boss's takings, open on the floor in front of the man
                                                        # who counts them
lv.prop('extinguisher', 25.9, 10.86, 180)              # on the wall by the door

lv.area('the bar: counter along the north wall')
# Walkways (the user: "no room to get through"): a man is drawn 26 px wide, so about 1.2 m of clear floor along every
# way across the room. Behind the counter 1.25 m (one squeezes past the bartender); between a customer on a stool and
# the booths and the card game 1.2 m, the whole of row 15; from the front door a lane 1.5 m wide up to it, the card
# game on its left, the jukebox on its right; 1.2 m and more round the high table and the pool table. The men at the
# counter, the cards, the dope and the money stand square at what they work at (data/posts.js `front`).
for x in (15.5, 16.5, 17.5, 18.5, 20.5):                # (no module on the cut line)
    lv.prop('bar_counter', x, 13.85)
for x in (15.65, 16.75, 17.85, 18.95):
    lv.prop('chair', x, 14.5, 270)
for x in (17.59, 20.41):                                # the bottles: racked on the wall, either side of the
    lv.prop('back_bar', x, 12.16)                       # bartender and of the neon over his head
lv.prop('neon_tube_pink', 18.5, 12.05)
for x in (16.3, 18.0, 20.7):
    lv.prop('ceiling_lamp', x, 13.85)

lv.area('the bar: booths, card table, pool')
# two booths end to end along the west wall, each with its lamp; a chair across each table. They stop a metre short
# of the front: one dives in through the street windows behind them onto clear floor, and can vault on (the user)
for y in (16.0, 18.0):
    lv.prop('sofa', 15.5, y, 270)
    lv.prop('table', 16.5, y, 90)
    lv.prop('chair', 17.15, y, 180)
    lv.prop('wall_lamp', 15.09, y, 270)
# the poker game, the table lengthwise under its lamp: the dealer at its head, a player each side (an aisle of a metre
# to the booths, the lane from the door on the other side, and at its foot the way between them along the front)
lv.prop('card_table', 20.5, 17.75, 90)
lv.prop('ceiling_lamp', 20.5, 17.75)
lv.prop('chair', 18.7, 17.45, 0)
lv.prop('chair', 21.3, 18.05, 180)
lv.prop('plant', 17.85, 19.55)                          # in the corner between the booths and the game
lv.prop('pool_table', 27.2, 14.0)                       # its west end at the pool player's cue
lv.prop('pool_lamp', 27.2, 14.0)
lv.prop('table_round', 23.75, 13.65)                    # a high table to stand at and watch the game
lv.prop('arcade', 30.5, 12.5, 90)
lv.prop('wall_lamp', 30.91, 13.3, 90)
lv.prop('jukebox', 23.6, 19.6, 180)
lv.prop('ceiling_fan', 23.0, 15.0)                      # turning over the middle of the room
lv.prop('extinguisher', 23.6, 12.14)                    # by the toilets' door
lv.prop('plant', 28.65, 12.35)                          # east of the back room's door, clear of its way

lv.area('the bar: VIP room')
lv.prop('dance_stage', 30.0, 18.9)
lv.prop('mirror_ball', 28.5, 18.6)                      # its specks turn round the room
lv.prop('sofa', 28.15, 17.45)                           # clear of where one lands diving through the window
lv.prop('armchair', 26.5, 17.5, 0)
lv.prop('armchair', 26.5, 19.45, 0)
lv.prop('neon_tube_pink', 28.0, 19.93, 180)

# ---------------------------------------------------------------- rooftops of the neighbouring buildings
lv.area('the liquor store roof')
lv.prop('ladder', 1.5, 20.5)                            # the fire escape, at the corner of the street
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
lv.pigeons(4.6, 12.6, 3)
lv.pigeons(8.6, 6.0, 2)
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

# by the getaway van's cab door: he gets in and tears off (systems/Outro.js). Its way out: west along the back lot,
# a slide into the service alley (the junk and the two barrels of the lot's corner are in its way), down the alley
# over what stands in it, through the gate, across the pavement (the hydrant, the meter) and round onto the road,
# west, clipping the tail of the car parked there. `fade`: black from the second bend on.
exit_zone = {'x': 23.4, 'y': 4.0, 'r': 1.3, 'route': [[12.45, 2.6], [12.45, 23.9], [-9, 24.3]], 'radius': [3, 4.2], 'fade': 16}

if __name__ == '__main__':
    lv.check(guards=14)
    lv.write('level1', name='NEON NIGHTS', subtitle='SUNSET BAY  -  MARCH 15TH 1986  -  2:14 AM', exit=exit_zone,
             objective=['CLEAN OUT THE BAR', 'GET TO THE VAN IN THE BACK LOT'],
             lights=lights, ambient=ambient, header=[
                 'Level 1 - "NEON NIGHTS": an alley, a road, the MIRAGE bar, its back room, and the way out through the back lot.',
                 'Ways in: the front door, the chain-link gate of the service alley (west), the dark gap behind the',
                 'anonymous door right of the bar (east), the liquor store and its roof (far west), three windows.',
                 'Lit shop fronts on the street: liquor, TV, laundromat.',
             ])
