"""The weapons at FINE density, drawn side on as the real thing (+x the muzzle), what they break into, their
magazines and the ammunition on the floor, the casings."""

from .core import ascii_cv, Batch, hx, lt, ramp
from .palette import BRASS, STEEL, STEEL_L, WOOD


OLIVE = ramp('#5d6a32', 0.45, 0.22, 0.3)
DRAB = ramp('#4c5236', 0.45, 0.22, 0.3)    # olive drab polymer (the shotgun's stock and forend)


# ---- weapons at FINE density, each drawn by hand side on as the real thing (sights, serrations, a trigger guard,
# checkering, grain, tape, rust, old blood), lit from the top. A gun's barrel ends on its last column but one (the
# outline beyond it): the game fires from there, on the line `bore` (src/game/data/weapons.js, tests/muzzle.test.mjs)
def drawn(w, h, segs):
    """A drawing laid out by hand at FINE density: segs = { row: [(x, 'chars'), ...] } on a w x h grid of '.', one
    clear pixel kept all round for the outline."""
    g = [['.'] * w for _ in range(h)]
    for y, runs in segs.items():
        for x, s in runs:
            assert 1 <= y <= h - 2 and x >= 1 and x + len(s) <= w - 1, (w, h, x, y, s)
            for i, ch in enumerate(s):
                g[y][x + i] = ch
    return [''.join(r) for r in g]


def without(segs, runs):
    """segs less the runs that start at the x listed per row ({row: (x, ...)}): a gun with its magazine out"""
    return {y: [r for r in rs if r[0] not in runs.get(y, ())] for y, rs in segs.items()}


def weapon_breaks(W, pal, bat, knife, iron):
    """What the player's melee weapons break into (src/game/data/weapons.js `parts`, `bends`), cut from their own
    drawings so that every piece keeps its place on the weapon's line: the bat snapped across the taper of its
    handle (the handle with its splinters, the barrel with its own, raw pale wood at the break), the knife snapped
    at the guard (the handle with a stub of its tang, the blade), the tire iron bent up past the middle of its bar."""
    def put(rows, x, y, ch):
        rows[y] = rows[y][:x] + ch + rows[y][x + 1:]
    # the bat: where each row of the taper gives, the raw wood of the break, splinters left standing out of it
    cut = {2: 22, 3: 21, 4: 23, 5: 22, 6: 24}
    handle = [r[:cut[y]].ljust(25, '.') if y in cut else r[:25] for y, r in enumerate(bat)]
    head = [('.' * cut[y] + r[cut[y]:])[20:] if y in cut else r[20:] for y, r in enumerate(bat)]
    for y, c in cut.items():
        put(handle, c - 1, y, 'm')
        put(head, c - 20, y, 'm')
    put(handle, 21, 3, 'm'); put(handle, 22, 3, 'l'); put(handle, 22, 5, 'l')   # long splinters off the handle
    put(head, 22 - 20, 4, 'm'); put(head, 23 - 20, 6, 'l')                       # ... and off the barrel
    W['bat_handle'] = ascii_cv(handle, pal)
    W['bat_head'] = ascii_cv(head, pal)
    # the knife: the grip and guard with the stub of the tang; the blade, its base chipped
    hilt = [r[:14] + '..' for r in knife]
    put(hilt, 14, 4, 'M'); put(hilt, 14, 5, 'D')
    blade = ['.' + r[14:] for r in knife]
    put(blade, 1, 3, '.'); put(blade, 1, 7, '.')
    W['knife_handle'] = ascii_cv(hilt, pal)
    W['knife_blade'] = ascii_cv(blade, pal)
    # the tire iron bent up from the middle of its bar (each column past the bend raised a little more), a bright
    # stress mark on the outside of the bend
    rows = ['.' * len(iron[0]) for _ in range(len(iron) + 1)]
    for y, r in enumerate(iron):
        for x, ch in enumerate(r):
            if ch != '.':
                put(rows, x, y + 1 - (round((x - 15) * 0.32) if x > 15 else 0), ch)
    put(rows, 15, 9, 'S'); put(rows, 16, 9, 'S')
    W['tire_iron_bent'] = ascii_cv(rows, pal)


def weapons():
    W = {}
    gun = {'L': STEEL[3], 'M': STEEL[2], 'D': STEEL[1], 'K': STEEL[0], 'w': WOOD[3], 'W': WOOD[2],
           'V': WOOD[1], 'G': hx('#2a2230'), 'g': hx('#4a3e50'), 'S': STEEL_L[3], 's': STEEL_L[2],
           'c': hx('#36e8f0'), 'C': hx('#1a98a8'), 'o': OLIVE[3], 'O': OLIVE[2], 'Q': OLIVE[1], 'q': OLIVE[0],
           'y': hx('#f9c80e'), 'Y': hx('#b88a08'), 'r': hx('#b8262c'), 'R': hx('#7a1420'), 't': hx('#d8d8e0'),
           'T': hx('#2a2230'), 'x': hx('#7a4a32'), 'n': hx('#1c1820'), 'h': hx('#5a0c16'),
           'a': DRAB[3], 'A': DRAB[2], 'z': DRAB[1], 'Z': DRAB[0],
           # the pool cue: dark butt, its linen wrap, pale maple, the ferrule, the chalked tip (and their undersides)
           'B': hx('#3a2418'), 'k': hx('#241610'), 'b': hx('#6a4426'), 'j': hx('#4a2e1a'), 'm': hx('#d8c090'),
           'f': hx('#f0ece0'), 'e': hx('#c8c4b8'), 'l': hx('#a88e5c'),
           # the bat's ash, lit to shaded
           'u': hx('#dcb47c'), 'U': hx('#bc9058'), 'i': hx('#8e643a'), 'I': hx('#5e3e24')}
    # an M1911 .45, side on: the blued slide with its rear serrations, the ejection port, the bushing at the muzzle,
    # the hammer spur and the grip safety's beak at the back, the thumb safety and the slide stop on the frame, the
    # trigger in its guard, and the grip raked back under it in checkered walnut panels, a screw top and bottom
    PISTOL = {
        1: [(2, 'K'), (5, 'KK'), (23, 'K')],
        2: [(2, 'DK'), (4, 'M' + 'L' * 20 + 'S')],
        3: [(3, 'K'), (4, 'MKMKMKM'), (11, 'MM'), (13, 'nnnnn'), (18, 'MMMMMM'), (24, 'S'), (25, 'D')],
        4: [(4, 'DKDKDKD'), (11, 'DD'), (13, 'Knnnn'), (18, 'DDDDDD'), (24, 'L'), (25, 'K')],
        5: [(2, 'DD'), (4, 'K' * 22)],
        6: [(3, 'D'), (4, 'M'), (5, 'LKD'), (8, 'MMMM'), (12, 'KK'), (14, 'MMMMMMM')],
        7: [(3, 'D'), (4, 'wwwww'), (9, 'K'), (10, 'DDDDDDDDDDK')],
        8: [(3, 'D'), (4, 'wwSww'), (9, 'K'), (10, 'nMnnD')],
        9: [(2, 'D'), (3, 'WwVwWV'), (9, 'K'), (10, 'nDnnD')],
        10: [(2, 'D'), (3, 'VWwVW'), (8, 'KMMMDK')],
        11: [(1, 'D'), (2, 'WVWVWV'), (8, 'K')],
        12: [(1, 'D'), (2, 'VVSVV'), (7, 'K')],
        13: [(1, 'DKKKKK')]}
    W['pistol'] = ascii_cv(drawn(27, 15, PISTOL), gun)
    # (each magazine gun also has a `_bare` sprite: the same gun, its magazine out of the well; weapons.js `well`)
    W['pistol_bare'] = ascii_cv(drawn(27, 15, without(PISTOL, {13: (1,)})), gun)
    # an Uzi, side on, in its dark parkerized finish: the top cover with the rear sight, the cocking knob and the eared
    # front sight, the receiver's pressed rib with the ejection port and two rivets, the knurled barrel nut and the stub
    # of barrel; the stock folded under it (its strut along the belly, the butt plate hanging under the nut); the grip
    # under the middle with its grip safety, the magazine's base out of its heel, the big trigger guard
    def uzi(can, bare=False):
        rows = {
            1: [(3, 'MD'), (17, 'LM'), (23, 'DMD')],
            2: [(3, 'MML' + 'M' * 13 + 'L' + 'M' * 6)],
            3: [(2, 'D' * 24), (26, 'LSL')],
            4: [(2, 'K' * 24), (26, 'DKD')],
            5: [(2, 'MMMSMMMMSMM'), (13, 'nnnn'), (17, 'M' * 9), (26, 'LSL')],
            6: [(2, 'D' * 11), (13, 'Knnn'), (17, 'D' * 9), (26, 'DKD')],
            7: [(2, 'S'), (3, 'K' * 23), (26, 'MDM')],
            8: [(2, 'SM'), (4, 'MMMMMM'), (10, 'M'), (11, 'gGgGgG'), (17, 'DDDDDDD'), (24, 'SMD')],
            9: [(10, 'M'), (11, 'GgGgGg'), (17, 'K'), (19, 'M'), (23, 'D'), (25, 'MD')],
            10: [(10, 'M'), (11, 'gGgGgG'), (17, 'K'), (19, 'D'), (22, 'D'), (25, 'MD')],
            11: [(10, 'D'), (11, 'GgGgGg'), (17, 'DDDDDD'), (25, 'DK')],
            12: [(11, 'gGgGgG')],
            13: [(11, 'nnnnnn')],
            14: [(12, 'MMMD')],
            15: [(12, 'MMDD')],
            16: [(11, 'KDDDDK')]}
        if can:   # a long suppressor screwed on the nut: brushed steel, a ring at each end
            for y, c in {3: 'S', 4: 'L', 5: 'M', 6: 'D', 7: 'K'}.items():
                rows[y].append((29, 'D' + c * 14 + 'D'))
        else:
            rows[4].append((29, 'LLL'))
            rows[5].append((29, 'MMM'))
            rows[6].append((29, 'DDK'))
        if bare:   # the magazine's base out of the grip's heel
            rows = without(rows, {14: (12,), 15: (12,), 16: (11,)})
        return drawn(46 if can else 33, 18, rows)
    W['uzi'] = ascii_cv(uzi(False), gun)
    W['uzi_silenced'] = ascii_cv(uzi(True), gun)
    W['uzi_bare'] = ascii_cv(uzi(False, True), gun)
    W['uzi_silenced_bare'] = ascii_cv(uzi(True, True), gun)
    # a Benelli-style semi-auto combat shotgun: the olive pistol-grip stock and its rubber pad, the black receiver
    # with the ghost-ring rear sight and the rail on top, the ejection port and the bolt handle, a red shell in the
    # loading port under it, the trigger guard; the thick barrel over the round magazine tube (no box magazine: that
    # is the M16), the olive forend on the tube, the barrel clamp, the tube's cap and the winged front sight
    W['shotgun'] = ascii_cv(drawn(51, 14, {
        1: [(16, 'K'), (19, 'K'), (45, 'K'), (47, 'K')],
        2: [(16, 'KMMK'), (20, 'DnDnDnDn'), (45, 'KDK')],
        3: [(1, 'TT'), (3, 'a' * 12), (15, 'g' * 13)],
        4: [(1, 'TT'), (3, 'A' * 12), (15, 'GGGG'), (19, 'nnnnnn'), (25, 'GGG'), (28, 'L' * 22)],
        5: [(1, 'TT'), (3, 'A' * 12), (15, 'GgGG'), (19, 'nSLnnn'), (25, 'GGG'), (28, 'M' * 15), (43, 'K'), (44, 'MMMMMK')],
        6: [(1, 'TT'), (3, 'AzzzzzzzzzAA'), (15, 'G' * 13), (28, 'K' * 15), (43, 'K'), (44, 'KKKKKK')],
        7: [(1, 'TT'), (3, 'z' * 11), (15, 'nnnnnnnnnnnnn'), (28, 'aaaaaaaa'), (36, 'sssssss'), (43, 'K'), (44, 'SSL')],
        8: [(1, 'TT'), (3, 'zzzzzzzz'), (14, 'AAAA'), (18, 'KKKKKnyrrRK'), (28, 'AzAzAzAA'), (36, 'MMMMMMM'), (43, 'K'), (44, 'LMD')],
        9: [(1, 'TT'), (3, 'zzzZZ'), (13, 'zAAAA'), (18, 'D'), (21, 'K'), (28, 'zzzzzzzz'), (36, 'DDDDDDD'), (43, 'K'), (44, 'DDK')],
        10: [(1, 'TT'), (3, 'ZZ'), (13, 'AzAz'), (17, 'KKKKK'), (29, 'ZZZZZZZ'), (44, 'K')],
        11: [(12, 'zAzA')],
        12: [(12, 'ZZZZ')]}), gun)
    # an M16, side on like the others: the straight black stock in line with the bore, the receiver under its carry
    # handle (the rear sight at its back, the ejection port, the forward assist), the round ribbed handguard behind
    # its delta ring, the triangular front sight, the bare barrel, the slotted flash hider; the pistol grip and the
    # thirty-round magazine curving forward under it. Black and dark greys, a box magazine: nothing like the shotgun.
    RIFLE = {
        1: [(17, 'K'), (45, 'K')],
        2: [(16, 'MMMMMMMMMM'), (44, 'KK')],
        3: [(16, 'D'), (17, 'DK'), (19, 'nnnnnn'), (25, 'D'), (43, 'KMKK')],
        4: [(2, 'g'), (15, 'KKKKKKKKKKKK'), (27, 'MM'), (29, 'gGgGgGgGgGgGgG'), (43, 'KKKKK')],
        5: [(1, 'n'), (2, 'gggggggggggggM'), (16, 'MMMMMMMMMSM'), (27, 'DD'), (29, 'gGgGgGgGgGgGgG'), (43, 'DMDD'),
            (47, 'MMMM'), (51, 'MKMK')],
        6: [(1, 'n'), (2, 'GGGGGGGGGGGGGD'), (16, 'DDDDKKKKDMD'), (27, 'DD'), (29, 'GnGnGnGnGnGnGn'), (43, 'KKKK'),
            (47, 'DDDD'), (51, 'KDKD')],
        7: [(1, 'n'), (2, 'GGGGGGGGGGGGGK'), (16, 'KKKKKKKKKKK'), (27, 'KK'), (29, 'nnnnnnnnnnnnnn'), (44, 'KK')],
        8: [(1, 'n'), (2, 'nGGGGGGGGGGn'), (16, 'KKKKKKKDKKKK')],
        9: [(1, 'n'), (2, 'nnGGGGGGn'), (17, 'GgG'), (20, 'K'), (22, 'K'), (23, 'GgGGG')],
        10: [(2, 'nnGGn'), (16, 'GgG'), (20, 'KKK'), (24, 'GgGGG')],
        11: [(16, 'Ggn'), (24, 'GgGGG')],
        12: [(15, 'Ggn'), (25, 'GgGGG')],
        13: [(15, 'nn'), (26, 'nnnnn')]}
    W['rifle'] = ascii_cv(drawn(56, 16, RIFLE), gun)
    W['rifle_bare'] = ascii_cv(drawn(56, 16, without(RIFLE, {9: (23,), 10: (24,), 11: (24,), 12: (25,), 13: (26,)})), gun)
    # a heavy .50 anti-materiel rifle: the stock with its cheek rest and thick pad, the long receiver under a big
    # scope (eyepiece, turret, objective bell, a glint of its lens), the folding carry handle, the cooling holes of
    # the barrel shroud, the pistol grip, the trigger guard, the ten-round box magazine, the heavy fluted barrel with
    # the bipod folded under it, and the double-chamber muzzle brake at its end
    SNIPER = {
        1: [(11, 'gggg'), (20, 'KSSK'), (31, 'gggggg')],
        2: [(11, 'GGGG'), (15, 'ggggg'), (20, 'DMMD'), (24, 'ggggggg'), (31, 'GGGGGc')],
        3: [(11, 'GGGG'), (15, 'GGGGGGG'), (22, 'S'), (23, 'GGGGGGGG'), (31, 'GGGGGC')],
        4: [(11, 'nnnn'), (15, 'nn'), (17, 'KK'), (19, 'nnnnnnnnn'), (28, 'KK'), (30, 'n'), (31, 'nnnnnn'),
            (38, 'DLLLLD')],
        5: [(4, 'gggggg'), (13, 'DnDnDnDnDnDnDnDnDnDnDnDnD'), (38, 'K'), (43, 'K'), (64, 'LLLLLL')],
        6: [(1, 'TT'), (3, 'gggggggggg'), (13, 'L' * 32), (63, 'MnnMnnMD')],
        7: [(1, 'TT'), (3, 'GGGGGGGGGG'), (13, 'MMMMMMMM'), (21, 'nnnnn'), (26, 'MMMMMMMMMM'), (36, 'MnMnMnMnM'),
            (45, 'L' * 18), (63, 'MnnMnnMD')],
        8: [(1, 'TT'), (3, 'GnnnnnnnGG'), (13, 'MMMMMMMM'), (21, 'nSLnn'), (26, 'MMMMMMMMMM'), (36, 'DnDnDnDnD'),
            (45, 'MMDMMDMMDMMDMMDMMD'), (63, 'MnnMnnMD')],
        9: [(1, 'TT'), (3, 'GGGGGGGGGG'), (13, 'D' * 32), (45, 'D' * 18), (63, 'MnnMnnMD')],
        10: [(1, 'TT'), (3, 'GGGGGGGGG'), (13, 'D' * 22), (35, 'KKKKKKKKK'), (44, 'KDD'), (47, 'n' * 11), (58, 'K'),
             (63, 'MnnMnnMD')],
        11: [(1, 'TT'), (3, 'nnnnnnn'), (15, 'gGgG'), (19, 'n'), (20, 'D'), (23, 'K'), (25, 'MLLLLMD'), (44, 'KK'),
             (46, 'D' * 12), (58, 'KK'), (64, 'DDDDDD')],
        12: [(15, 'GgGg'), (19, 'KKKKK'), (25, 'MMMMMMD'), (58, 'K')],
        13: [(14, 'gGgG'), (25, 'MDDDDMD')],
        14: [(14, 'GgGg'), (25, 'MMMMMMD')],
        15: [(14, 'nnnn'), (24, 'KKKKKKKKK')]}
    W['sniper'] = ascii_cv(drawn(72, 17, SNIPER), gun)
    W['sniper_bare'] = ascii_cv(drawn(72, 17, without(SNIPER, {11: (25,), 12: (25,), 13: (25,), 14: (25,), 15: (24,)})), gun)
    # a bazooka of the M20 kind, side on: the flared venturi at the back, the olive tube with its clamps, the shoulder
    # rest under it, the pistol grip and trigger, the front grip, the reflex sight and the contact box on top, the
    # yellow band of a live round, the reinforced muzzle ring
    W['bazooka'] = ascii_cv(drawn(52, 14, {
        1: [(1, 'QO'), (21, 'DMMD'), (34, 'aA')],
        2: [(1, 'QOo'), (21, 'DcCD'), (25, 'K'), (34, 'Az')],
        3: [(1, 'qOo'), (4, 'o' * 4), (8, 'O'), (9, 'o' * 17), (26, 'O'), (27, 'o' * 13), (40, 'yy'), (42, 'oo'), (44, 'O'), (45, 'ooo'), (48, 'MLL')],
        4: [(1, 'qOO'), (4, 'O' * 4), (8, 'q'), (9, 'O' * 17), (26, 'q'), (27, 'O' * 13), (40, 'yy'), (42, 'OO'), (44, 'q'), (45, 'OOO'), (48, 'MMM')],
        5: [(1, 'qQO'), (4, 'O' * 4), (8, 'q'), (9, 'OOOxOOOOOOOOOOOOO'), (26, 'q'), (27, 'O' * 13), (40, 'yY'), (42, 'OO'), (44, 'q'), (45, 'OOO'), (48, 'MMD')],
        6: [(1, 'qQO'), (4, 'O' * 4), (8, 'q'), (9, 'O' * 17), (26, 'q'), (27, 'OOOOtOtOtOOOO'), (40, 'yY'), (42, 'OO'), (44, 'q'), (45, 'OOO'), (48, 'DMD')],
        7: [(1, 'qQQ'), (4, 'Q' * 4), (8, 'q'), (9, 'Q' * 17), (26, 'q'), (27, 'Q' * 13), (40, 'YY'), (42, 'QQ'), (44, 'q'), (45, 'QQQ'), (48, 'DMD')],
        8: [(1, 'qQQ'), (4, 'Q' * 4), (8, 'q'), (9, 'QQQQQQQQQQQQxQQQQ'), (26, 'q'), (27, 'Q' * 13), (40, 'YY'), (42, 'QQ'), (44, 'q'), (45, 'QQQ'), (48, 'DDD')],
        9: [(1, 'qQq'), (4, 'q' * 4), (8, 'q'), (9, 'q' * 17), (26, 'q'), (27, 'q' * 13), (40, 'qq'), (42, 'qq'), (44, 'q'), (45, 'qqq'), (48, 'DDK')],
        10: [(1, 'qQ'), (3, 'q' * 45), (48, 'KKK')],
        11: [(1, 'Qq'), (9, 'gGGGGg'), (17, 'gGG'), (20, 'KnK'), (29, 'gGG')],
        12: [(9, 'GGGGGG'), (16, 'gGGG'), (20, 'KKK'), (29, 'GGG')]}), gun)
    # a baseball bat in ash: the knob, the handle wound in black tape (its spiral catching the light, the end of it
    # ragged), the taper, the barrel's long grain and its burnt-in brand, two dents on top and an old stain under it
    BAT = drawn(46, 9, {
        1: [(28, 'UuuuuuuiuuuuuuU')],
        2: [(1, 'iu'), (18, 'UUUUUUUUUU'), (28, 'uuuuuuuuuuuiuuuu')],
        3: [(1, 'iU'), (3, 'gTnTgTnTgTnTgT'), (17, 'uuuuuuuuuuu'), (28, 'uuiIiuUUuuuuUUuuu')],
        4: [(1, 'iU'), (3, 'TgTnTgTnTgTnTg'), (17, 'UUUUUUUUUUU'), (28, 'UUIiIUUUUhRhUUUUU')],
        5: [(1, 'iU'), (3, 'nTgTnTgTnTgTn'), (16, 'iiiiiiiiiiii'), (28, 'iiUiiiiiihhhRiiii')],
        6: [(1, 'iI'), (18, 'IIIIIIIIII'), (28, 'iiiiiiiiihhRiiii')],
        7: [(28, 'IIIIIIIIhhIIIII')]})
    W['bat'] = ascii_cv(BAT, gun)
    # a big combat knife: the steel pommel, the ridged black rubber grip, a tall cross-guard, a wide clip-point blade
    # with the saw teeth along its spine, the lit flat, the fuller, the grind and the bright edge sweeping up to the tip
    KNIFE = drawn(30, 10, {
        1: [(12, 'MD')],
        2: [(12, 'LD'), (16, 'D'), (18, 'D'), (20, 'D'), (22, 'D')],
        3: [(1, 'SM'), (3, 'gngngngng'), (12, 'LD'), (14, 'M' * 10)],
        4: [(1, 'nS'), (3, 'GnGnGnGnG'), (12, 'MD'), (14, 'L' + 'S' * 9 + 'SSt')],
        5: [(1, 'MD'), (3, 'GnGnGnGnG'), (12, 'MD'), (14, 'DSMMMMMMMSSSStt')],
        6: [(1, 'DK'), (3, 'nTnTnTnTn'), (12, 'MD'), (14, 'D' + 's' * 12 + 't')],
        7: [(12, 'DK'), (14, 'D' + 't' * 11)],
        8: [(12, 'DK')]})
    W['knife'] = ascii_cv(KNIFE, gun)
    # a pool cue: the rubber bumper, the dark butt with its pearl inlays, the linen wrap, the forearm's spliced points,
    # the pearl joint collar, the maple shaft tapering to the white ferrule and the chalked blue tip
    BUTT = {1: [(1, 'n'), (2, 'BBBfBBBBBfBBBBBBBBB'), (21, 'bjbjbjbjbjbjbj'), (35, 'BBBmmmm')],
            2: [(1, 'n'), (2, 'BBBBBBBBBBBBBBBBBBB'), (21, 'jbjbjbjbjbjbjb'), (35, 'BBBBBBm')],
            3: [(1, 'n'), (2, 'kkkkkkkkkkkkkkkkkkk'), (21, 'bjbjbjbjbjbjbj'), (35, 'kkkkkkl')],
            4: [(1, 'n'), (2, 'kkkfkkkkkfkkkkkkkkk'), (21, 'jjjjjjjjjjjjjj'), (35, 'kkkllll')]}
    W['cue'] = ascii_cv(drawn(80, 6, {
        1: BUTT[1] + [(42, 'mmm'), (45, 'fe'), (47, 'm' * 14)],
        2: BUTT[2] + [(42, 'mmm'), (45, 'fe'), (47, 'm' * 28), (75, 'fff'), (78, 'c')],
        3: BUTT[3] + [(42, 'lll'), (45, 'ee'), (47, 'l' * 28), (75, 'eee'), (78, 'C')],
        4: BUTT[4] + [(42, 'lll'), (45, 'ee'), (47, 'l' * 14)]}), gun)
    # what is left of it once snapped across the forearm: the splinters it broke into
    W['cue_half'] = ascii_cv(drawn(46, 6, {
        1: BUTT[1] + [(42, 'm')],
        2: BUTT[2] + [(42, 'mmm')],
        3: BUTT[3] + [(42, 'll')],
        4: BUTT[4]}), gun)
    # a tire iron: black paint worn back to the steel, rust in the chips; the pry end flattened and turned up, the
    # other bent down into the hex socket
    IRON = drawn(34, 15, {
        4: [(1, 'S')],
        5: [(1, 'SM')],
        6: [(2, 'MSMMMMLMMMMMMMSMMMMMMMMMSM')],
        7: [(2, 'DGGGGGxGGGGGGGGGGGxxGGGGGGGD')],
        8: [(3, 'nTTTTTTTTTTTTTTTTTTTTTTTTGGD')],
        9: [(28, 'MGD')],
        10: [(28, 'MGD')],
        11: [(27, 'LMMMD')],
        12: [(27, 'MGGGD')],
        13: [(27, 'KnnnK')]})
    W['tire_iron'] = ascii_cv(IRON, gun)
    weapon_breaks(W, gun, BAT, KNIFE, IRON)
    # the magazines, at the guns' density and as wide as their wells (top row: the round on the lips, its bullet toward
    # the muzzle; bottom row: the base plate). They show sliding out of the well, falling, and lying on the floor.
    mag = dict(gun, B=BRASS[3], b=BRASS[1], c=hx('#e07a3a'))
    # the 1911's: blued steel, its witness holes down the side
    W['mag_pistol'] = ascii_cv(drawn(5, 14, dict([(1, [(1, 'bBc')]), (2, [(1, 'LMD')])]
                                               + [(y, [(1, 'LKD' if y in (4, 7) else 'LMD')]) for y in range(3, 12)]
                                               + [(12, [(1, 'KKK')])])), mag)
    # the Uzi's: a long straight stick of steel, ribbed down its side, a thick base plate
    W['mag_uzi'] = ascii_cv(drawn(5, 18, dict([(1, [(1, 'bBc')]), (2, [(1, 'LMD')])]
                                            + [(y, [(1, 'LDD' if y % 4 == 1 else 'LMD')]) for y in range(3, 15)]
                                            + [(15, [(1, 'DKD')]), (16, [(1, 'KKK')])])), mag)
    # the M16's: black, curving forward toward its base
    W['mag_rifle'] = ascii_cv(drawn(8, 16, dict([(1, [(1, 'bBBc')])]
                                              + [(y, [(1 + (y > 5) + (y > 10), 'gGGn')]) for y in range(2, 14)]
                                              + [(14, [(3, 'nnnn')])])), mag)
    # the .50's: a fat steel box, the big round lying on its lips, a rib round it
    W['mag_sniper'] = ascii_cv(drawn(9, 12, dict([(1, [(1, 'bBBBccc')]), (2, [(1, 'LLLLLMD')])]
                                               + [(y, [(1, 'LDDDDMD' if y == 5 else 'LMMMMMD')]) for y in range(3, 10)]
                                               + [(10, [(1, 'KKKKKKK')])])), mag)
    W['rocket'] = ascii_cv([".........",
                            ".QooorRt.",
                            ".qQQQRRR.",
                            "........."], gun)
    W['casing'] = ascii_cv(["yBb",
                            "Bbd"], {'y': lt(BRASS[2], 0.5), 'B': BRASS[2], 'b': BRASS[1], 'd': BRASS[0]}, ol=None)
    W['shell'] = ascii_cv(["BrRr",
                           "bRRd"], {'B': BRASS[3], 'b': BRASS[1], 'r': hx('#ff5050'), 'R': hx('#c8202a'),
                                     'd': hx('#7a1018')}, ol=None)
    return W


# --------------------------------------------------------------------------
# Ammo pickups (+x = bullet tips)
# --------------------------------------------------------------------------

def mags():
    out = {}
    # (the guns' magazines are painted with the guns, weapons())
    red = ramp('#e8303a', 0.5, 0.25, 0.3)
    # floor pickups: bright boxes with a label stripe
    yel = ramp('#f9c80e', 0.5, 0.25, 0.45)
    out['ammo_9mm'] = ascii_cv([".........",
                                ".c.c.c.c.",
                                ".AAAAAAA.",
                                ".yyyyyyy.",
                                ".KKKKKKK.",
                                ".DDDDDDD.",
                                "........."], {'A': yel[3], 'y': yel[2], 'D': yel[0], 'K': hx('#1a1020'),
                                               'c': hx('#e07a3a')})
    out['ammo_12g'] = ascii_cv([".........",
                                ".BAAAAAa.",
                                ".brrrrrR.",
                                ".wwwwwww.",
                                ".BAAAAAa.",
                                ".brrrrrR.",
                                "........."], {'A': red[3], 'a': red[2], 'r': red[2], 'R': red[0], 'B': BRASS[3],
                                               'b': BRASS[1], 'w': hx('#f4f0ff')})
    grn = ramp('#3ad06a', 0.5, 0.25, 0.4)
    out['ammo_762'] = ascii_cv([".........",
                                "...KKK...",
                                ".AAAAAAA.",
                                ".gggggGd.",
                                ".yyyyyyd.",
                                ".DDDDDDD.",
                                "........."], {'A': grn[3], 'g': grn[2], 'G': grn[1], 'd': grn[1], 'D': grn[0],
                                               'y': hx('#f9c80e'), 'K': hx('#2a2a34')})
    ol_ = ramp('#7a8a3a', 0.5, 0.25, 0.4)
    out['ammo_rocket'] = ascii_cv(["............",
                                   ".Kk......r..",
                                   ".KAAAAyAArRr",
                                   ".KgggggyggRR",
                                   ".Kk......R..",
                                   "............"], {'A': ol_[3], 'g': ol_[1], 'y': hx('#ff6b1a'), 'r': hx('#ff5a4a'),
                                                     'R': hx('#c8202a'), 'K': hx('#2a2430'), 'k': hx('#4a4458')})
    return out


WEAPONS = Batch(lambda: {**weapons(), **mags()})
GROUP = 'weapons'
SPRITES = {
    'pistol': (WEAPONS('pistol'), (13.5, 7.5), 'dense req'),
    'uzi': (WEAPONS('uzi'), (16.5, 9), 'dense req'),
    'uzi_silenced': (WEAPONS('uzi_silenced'), (23, 9), 'dense req'),
    'shotgun': (WEAPONS('shotgun'), (25.5, 7), 'dense req'),
    'rifle': (WEAPONS('rifle'), (28, 8), 'dense req'),
    'sniper': (WEAPONS('sniper'), (36, 8.5), 'dense req'),
    'bazooka': (WEAPONS('bazooka'), (26, 7), 'dense req'),
    'bat': (WEAPONS('bat'), (23, 4.5), 'dense req'),
    'knife': (WEAPONS('knife'), (15, 5), 'dense req'),
    'cue': (WEAPONS('cue'), (40, 3), 'dense req'),
    'cue_half': (WEAPONS('cue_half'), (23, 3), 'dense req'),
    'tire_iron': (WEAPONS('tire_iron'), (17, 7.5), 'dense req'),
    'rocket': (WEAPONS('rocket'), (9, 4), 'req'),
    'bat_handle': (WEAPONS('bat_handle'), (12.5, 4.5), 'dense'),
    'bat_head': (WEAPONS('bat_head'), (13, 4.5), 'dense'),
    'knife_handle': (WEAPONS('knife_handle'), (8, 5), 'dense'),
    'knife_blade': (WEAPONS('knife_blade'), (8.5, 5), 'dense'),
    'tire_iron_bent': (WEAPONS('tire_iron_bent'), (17, 8), 'dense req'),
    'pistol_bare': (WEAPONS('pistol_bare'), (13.5, 7.5), 'dense'),
    'uzi_bare': (WEAPONS('uzi_bare'), (16.5, 9), 'dense'),
    'uzi_silenced_bare': (WEAPONS('uzi_silenced_bare'), (23, 9), 'dense'),
    'rifle_bare': (WEAPONS('rifle_bare'), (28, 8), 'dense'),
    'sniper_bare': (WEAPONS('sniper_bare'), (36, 8.5), 'dense'),
    'casing': (WEAPONS('casing'), (3, 2), 'req'),
    'shell': (WEAPONS('shell'), (4, 2), 'req'),
    'mag_pistol': (WEAPONS('mag_pistol'), (2.5, 7), 'dense'),
    'mag_uzi': (WEAPONS('mag_uzi'), (2.5, 9), 'dense'),
    'mag_rifle': (WEAPONS('mag_rifle'), (4, 8), 'dense'),
    'mag_sniper': (WEAPONS('mag_sniper'), (4.5, 6), 'dense'),
    'ammo_9mm': (WEAPONS('ammo_9mm'), (9, 7), ''),
    'ammo_12g': (WEAPONS('ammo_12g'), (9, 7), ''),
    'ammo_762': (WEAPONS('ammo_762'), (9, 7), ''),
    'ammo_rocket': (WEAPONS('ammo_rocket'), (12, 6), ''),
}
