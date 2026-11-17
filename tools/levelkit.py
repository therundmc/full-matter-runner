"""Level builder kit: compose a level in Python, check it, and write it as a JS data module.

Levels are composed instead of typed as ASCII so that the layout can be checked: every actor must stand on a
floor tile, and no piece of furniture may sit inside a wall, across a door, on a spawn or inside another piece.
Units: 1 tile = 1 m = 32 px. Props are placed by their centre, in tiles (floats, tile centre = n + 0.5).

    from levelkit import Level
    lv = Level(44, 38)
    lv.fill(11, 1, 30, 4, '_')
    lv.actor('@', 21, 35, face=270)
    lv.area('back lot')
    lv.prop('van', 24.5, 2.3, 180, lights=False)
    lv.roof('skylight', 16.0, 35.5)
    lv.check(guards=13)
    lv.write('level1', header=[...], name='...', subtitle='...')

Legends: tiles in src/game/world/TileMap.js, actors in src/game/world/Level.js, props in src/game/data/props.js,
rooftop dressing in src/game/data/roofs.js (scenery on the flat roofs: the brick tiles surrounded by walls).
"""
import json
import math
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOLID = set(' #X')
WALLS = set('#X')
OPENINGS = set('DLGF')
GUARDS = set('pushrbkmji')

# hitboxes in px (keep in sync with src/game/data/props.js and Vehicle.js)
# None = hangs from the ceiling / sits on a wall: never in the way
SIZES = dict(
    cash_case=(20, 14), table=(44, 26), table_round=(28, 28), card_table=(58, 36), dope_table=(44, 26), gas_bottle=(12, 12), dance_stage=(48, 48), desk=(46, 24), chair=(14, 14), armchair=(26, 26), sofa=(64, 28),
    plant=(15, 15), tv=(22, 15), fridge=(22, 22), oven=(20, 20), sink=(26, 18), toilet=(13, 21), bed=(44, 64),
    pool_table=(80, 44), arcade=(22, 27), crate=(19, 19), barrel=(18, 18), bookshelf=(40, 11), speaker=(14, 14),
    dj_booth=(58, 22), bar_counter=(32, 19), dumpster=(58, 34), trash_can=(15, 15), jukebox=(28, 20),
    hydrant=(11, 11), bench=(50, 15), palm_tree=(9, 9), streetlight=(6, 6), floor_lamp=(10, 10), table_lamp=(15, 15),
    car=(136, 54), car2=(130, 52), van=(156, 60), chain_fence=(32, 4), bottle_shelf=(40, 11), back_bar=(40, 8), washer=(22, 22),
    neon_sign_liquor=None, neon_sign_video=None, neon_sign_wash=None, alarm_box=None,
    neon_sign_bar=None, neon_sign_palm=None, neon_sign_arrow=None, wall_lamp=None, tube_light=None,
    neon_tube_pink=None, neon_tube_cyan=None, ceiling_lamp=None, pool_lamp=None, string_lights=None,
    ceiling_fan=None, mirror_ball=None, extinguisher=None,
    fuse_box=None, emergency_light=None, urinal=(12, 10), stall=(4, 48),
    apt_door=None, radiator=None, bike=(44, 12), bin_bag=(13, 12), jerrycan=(9, 11),
    ladder=(30, 30), parapet=(32, 10), ac_unit=(46, 32), roof_vent=(13, 13), water_tank=(48, 48),
    velvet_rope=(30, 6), sandwich_board=(16, 12), ash_urn=(10, 10), neon_sign_mirage=None, neon_sign_open=None,
    vending=(26, 20), phone_booth=(24, 24), parking_meter=(5, 5), news_box=(14, 11), pipe_steam=None, pipe_water=None, wall_vent=None,
    keg=(16, 16), beer_tap=None, curtain=None, fire_alarm=None,
    frame_photo=None, frame_gold=None, poster_fight=None, poster_band=None, dartboard=None, pay_phone=None,
    coat_hooks=None, towel_dispenser=None, neon_sign_beer=None, neon_sign_bay=None,
    poster_pinup=None, poster_revue=None, mirror_strip=None, neon_sign_lips=None, cocktail_table=(24, 24),
)

# furniture that is round: what lies on the floor beside it is kept off its circle, not its box
ROUND = {'dance_stage', 'table_round', 'cocktail_table'}

# what hangs on a wall face: no box above (never in the way of furniture) but a body in the game, its length along the
# wall in px (keep in sync with src/game/data/props.js): never across a doorway, where it bars the way (a lamp over the
# back door of level 1 had its men jammed in it)
ON_WALL = dict(wall_lamp=12, tube_light=28, neon_tube_pink=28, neon_tube_cyan=28, emergency_light=6, fuse_box=18,
               extinguisher=6, alarm_box=10, wall_vent=14, pipe_steam=96, pipe_water=96, radiator=28, neon_sign_palm=38,
               neon_sign_bar=42, neon_sign_arrow=28, neon_sign_liquor=44, neon_sign_video=42, neon_sign_wash=48,
               fire_alarm=10, neon_sign_mirage=42, neon_sign_open=26, frame_photo=10, frame_gold=12, poster_fight=14,
               poster_band=12, dartboard=9, pay_phone=8, coat_hooks=16, towel_dispenser=7, neon_sign_beer=34, neon_sign_bay=24,
               poster_pinup=12, poster_revue=14, mirror_strip=42, neon_sign_lips=22)

# sprites that are floor paint (Level.paint)
FLOOR = ('doormat', 'stairs', 'floor_hole', 'runner', 'newspaper', 'shoes', 'road_edge', 'parking_bay', 'entry_carpet',
         'trapdoor', 'rug', 'entry_mat')
LABELS = ('range', 'executions', 'soot', 'powder', 'steam', 'liquids', 'curtain', 'bars', 'pool', 'power', 'jukebox',
          'trapdoor', 'vehicles')   # stencilled words (props/label_*, tools/generate_assets.py LAB_LABELS)

# rooftop dressing in px (keep in sync with ROOF_SIZES in tools/generate_assets.py)
ROOF_SIZES = dict(ac_unit=(46, 32), vent=(14, 14), duct=(64, 12), hatch=(22, 22), chimney=(20, 20), tank=(50, 50),
                  antenna=(34, 34), bulkhead=(62, 54), skylight=(46, 30), skylight_tv=(46, 30), skylight_dark=(46, 30))
# the lit ones: (radius, offset along the piece's +y) of their glow in px (keep in sync with src/game/data/roofs.js)
ROOF_GLOW = dict(bulkhead=(56, 30), skylight=(62, 0), skylight_tv=(54, 0))


def js(v):
    return json.dumps(v).replace('"', "'")


class Level:
    # w, h: the size it is drawn at in the builder. cut_cols / cut_rows: whole tile columns / rows taken out of it at
    # the end (to tighten rooms without redrawing them): the builder keeps its own coordinates, every one of them is
    # moved here as it comes in (what lies inside a cut collapses onto its edge: keep things out of the cuts).
    def __init__(self, w, h, base='X', cut_cols=(), cut_rows=()):
        self.cut_x, self.cut_y = sorted(cut_cols), sorted(cut_rows)
        w, h = w - len(self.cut_x), h - len(self.cut_y)
        self.w, self.h = w, h
        self.tiles = [[base] * w for _ in range(h)]
        self.actors = [[' '] * w for _ in range(h)]
        self.props = []       # (area, type, col, row, deg, options)
        self.roofs = []       # (area, kind, col, row, deg)
        self.premises = []    # guarded tile rectangles [col0, row0, col1, row1]
        self.welcome = []     # rectangles where a stranger is a customer: guards never tell him to clear off
        self.music = None     # the soundtrack's track id (src/audio/tracks/index.js); None: the default one
        self.intro = None     # 'sit': the player starts sitting on the ground and gets up at the first key; 'swig':
                              # the same, after he has drunk off a bottle and smashed it on the wall across
        self.leans = []       # weapons stood against a wall: [type, col, row, deg]
        self.drops = []       # weapons lying about with a given magazine: [type, col, row, deg, rounds]
        self.bodies = []      # somebody already dead when the level starts: [kind, col, row, deg, pool px]
        self.fires = []       # something burning, for the look of it: [col, row, stage of the tutorial it catches at]
        self.floor = []       # what is painted on the floor, without a body: [sprite, col, row, deg]
        self.tutorial = None  # a level that teaches: { stages, fall } (src/game/systems/Tutorial.js)
        self.alarms = []      # closed shops: { rect: floor rectangle, box: [col, row] of the alarm box }
        self.mains = None     # the house's electricity: { box: [col, row], zone: tile rectangle it feeds }
        self.devices = {}     # the level's devices (src/game/data/devices.js): sprinklers, passage
        self.critters = {}    # street fauna: { pigeons: [[col, row, n]], cats: [[col, row]] }
        self.street = {}      # dressing without a body: { manholes: [[col, row]], papers: [[col0, row0, col1, row1, n]] }
        self.grimes = []      # the life of a room on its floor: [kind, col0, row0, col1, row1, n, options] (render/FloorWear.js)
        self.worn = []        # paths worn by feet: [col0, row0, col1, row1, width px]
        self.haze = []        # cigarette haze under a lamp: [col, row, radius tiles, density] (systems/Smoke.js)
        self.litters = []     # small things lying loose on a floor: [kind, col, row, deg, look] (systems/Litter.js)
        self.spots = []       # beds heard from one tile: [bed, col, row] (src/game/data/soundscape.js SPOTS)
        self.zones = []       # what each place sounds like: [kind, col0, row0, col1, row1] (src/game/data/soundscape.js)
        self.rain = None      # how hard it rains, 0..1 (heard: systems/Ambience.js)
        self.wet = None       # how wet the open ground is from an earlier rain, 0..1 (seen: systems/Weather.js)
        self.bars = []        # barred windows [col, row] (entities/Window.js `barred`)
        self.leaves = []      # free door leaves [col, row, deg, length, sprite] (a stall's door)
        self.facing = {}
        self.patrols = {}
        self.jobs = {}        # 'x,y' -> pastime of the guard posted there (src/game/ai/Pastimes.js)
        self.looks = {}       # 'x,y' -> a kind of his own for the guard there (his sprites: the boss)
        self.awake = []       # 'x,y' of the guards who see and hear in a passive level (the lab's sight tests)
        self.patrons = []     # [sprite, col, row, deg, pastime]: civilians posted indoors
        self.spawns = []      # centre of every character, for the overlap check
        self._area = ''

    # ---- the cuts: a builder's coordinate to the level's. along: a position (tiles, a float); tile: a tile index,
    # never in a cut; span: an inclusive tile range, what is left of it (None: all of it was cut)
    @staticmethod
    def _along(v, cuts):
        return v - sum(min(max(v - c, 0), 1) for c in cuts)

    @staticmethod
    def _tile(t, cuts, what='tile'):
        assert t not in cuts, f'{what} on a cut line ({t})'
        return t - sum(c < t for c in cuts)

    @staticmethod
    def _span(a, b, cuts):
        kept = [t - sum(c < t for c in cuts) for t in range(a, b + 1) if t not in cuts]
        return (kept[0], kept[-1]) if kept else None

    def X(self, v):
        return round(self._along(v, self.cut_x), 4)

    def Y(self, v):
        return round(self._along(v, self.cut_y), 4)

    def at(self, col, row):
        return self.X(col), self.Y(row)

    def rect(self, c0, r0, c1, r1):
        sx, sy = self._span(c0, c1, self.cut_x), self._span(r0, r1, self.cut_y)
        assert sx and sy, f'rectangle {c0},{r0},{c1},{r1} cut away whole'
        return [sx[0], sy[0], sx[1], sy[1]]

    def tile(self, x, y, what='tile'):
        return self._tile(x, self.cut_x, what), self._tile(y, self.cut_y, what)

    # ---- tiles
    def fill(self, x0, y0, x1, y1, ch):
        sx, sy = self._span(x0, x1, self.cut_x), self._span(y0, y1, self.cut_y)
        if not sx or not sy:
            return
        for y in range(sy[0], sy[1] + 1):
            for x in range(sx[0], sx[1] + 1):
                self.tiles[y][x] = ch

    def put(self, x, y, ch):
        x, y = self.tile(x, y, f'{ch!r}')
        self.tiles[y][x] = ch

    # ---- actors: player, guards (UPPERCASE = patrols along `route`), weapons, ammo
    def actor(self, ch, x, y, face=None, route=None, job=None, look=None, awake=False):
        x, y = self.tile(x, y, f'actor {ch}')
        route = route and [list(self.at(*q)) for q in route]
        t = self.tiles[y][x]
        assert t not in SOLID and t not in OPENINGS, f'actor {ch} on a solid tile at {x},{y}'
        assert self.actors[y][x] == ' ', f'two actors at {x},{y}'
        self.actors[y][x] = ch
        if face is not None:
            self.facing[f'{x},{y}'] = face
        if route:
            self.patrols[f'{x},{y}'] = route
        if job:
            self.jobs[f'{x},{y}'] = job
        if look:
            self.looks[f'{x},{y}'] = look
        if awake:
            self.awake.append(f'{x},{y}')
        if ch == '@' or ch.lower() in GUARDS:
            self.spawns.append((x + 0.5, y + 0.5))

    def patron(self, kind, x, y, deg, pastime):
        """A civilian posted indoors at (x, y) in tiles, facing deg, busy with `pastime`: he may sit on furniture."""
        x, y = self.at(x, y)
        assert self.tiles[int(y)][int(x)] not in SOLID | OPENINGS, f'patron in a wall at {x},{y}'
        self.patrons.append([kind, x, y, deg, pastime])

    # ---- props: `area` names the group they are listed under in the output
    def area(self, name):
        self._area = name

    def prop(self, kind, col, row, deg=0, **opt):
        self.props.append((self._area, kind, *self.at(col, row), deg, opt))

    # ---- a fire at (col, row); stage: the room of the tutorial he must have reached for it to catch (None: at once),
    # delay: s after that before it does
    # ---- something lying flat, painted on the floor once and for all (a doormat, a carpet runner, a flight of stairs):
    # nobody bumps into it and no round stops on it
    def paint(self, sprite, col, row, deg=0):
        assert sprite in FLOOR or sprite[6:] in LABELS and sprite.startswith('label_'), f'{sprite} is not floor paint'
        self.floor.append([sprite, *self.at(col, row), deg])

    def fire(self, col, row, stage=None, delay=None):
        col, row = self.at(col, row)
        self.fires.append([col, row] if stage is None else [col, row, stage] if delay is None else [col, row, stage, delay])

    # ---- a dead body at (col, row), its head toward deg, in a pool of `pool` px
    def body(self, kind, col, row, deg=0, pool=18):
        self.bodies.append([kind, *self.at(col, row), deg, pool])

    # ---- a weapon lying at (col, row) with `rounds` in it (None: full)
    def drop(self, kind, col, row, deg=0, rounds=None):
        self.drops.append([kind, *self.at(col, row), deg, rounds])

    # ---- a weapon stood against a wall at (col, row), its tip pointing deg (toward the wall)
    # a door leaf hinged at (col, row) in no wall, closed along deg, `length` px long (a toilet stall's door)
    def leaf(self, col, row, deg, length, sprite='structure/stall_door'):
        self.leaves.append([*self.at(col, row), deg, length, sprite])

    # iron bars on the windows at (col, row) (tiles 'G')
    def bar(self, *cells):
        for (c, r) in cells:
            self.bars.append([int(v) for v in self.at(c, r)])

    def lean(self, kind, col, row, deg=0):
        self.leans.append([kind, *self.at(col, row), deg])

    # ---- guarded premises (inclusive tile rectangle): guards leave an unarmed stranger alone anywhere else
    def guard(self, col0, row0, col1, row1):
        self.premises.append(self.rect(col0, row0, col1, row1))

    # ---- a closed shop (inclusive tile rectangle of its floor) whose alarm box hangs at (col, row) on its front
    def alarm(self, col0, row0, col1, row1, col, row, deg=0):
        self.alarms.append(dict(rect=self.rect(col0, row0, col1, row1), box=list(self.at(col, row))))
        self.prop('alarm_box', col, row, deg)

    # ---- the house's electricity (systems/Power.js): everything lit inside the inclusive tile rectangle hangs on the
    # fuse box at (col, row) on an outside wall; put `emergency_light` props over the doors for what is left after
    def power(self, col0, row0, col1, row1, col, row, deg=0):
        self.mains = dict(box=list(self.at(col, row)), zone=self.rect(col0, row0, col1, row1))
        self.prop('fuse_box', col, row, deg)

    # ---- the level's devices (src/game/data/devices.js, a system each)
    # the fire alarm (systems/Sprinklers.js): its pull station at (col, row) on a wall facing deg, the rooms it rains on
    def sprinklers(self, col, row, deg, rooms):
        self.devices['sprinklers'] = dict(pull=list(self.at(col, row)), rooms=[self.rect(*r) for r in rooms])
        self.prop('fire_alarm', col, row, deg)

    # the passage under the street: two trapdoors (sprite, col, row, deg), painted on the floor
    def passage(self, *ends):
        self.devices['passage'] = [list(self.at(c, r)) for (_, c, r, _) in ends]
        for (sprite, c, r, d) in ends:
            self.paint(sprite, c, r, d)

    # ---- street fauna (systems/Critters.js): a flock of n pigeons pecking about (col, row), a cat sitting at (col, row)
    def pigeons(self, col, row, n):
        self.fauna('pigeons', col, row, n)

    def cat(self, col, row):
        self.fauna('cats', col, row)

    def fauna(self, kind, col, row, *more):
        col, row = self.at(col, row)
        t = self.tiles[int(row)][int(col)]
        assert t not in SOLID and t not in 'DLG', f'{kind} at {col},{row} in {t!r}'
        self.critters.setdefault(kind, []).append([col, row, *more])

    # ---- street dressing without a body: 'manholes' col, row (a cover breathing steam, systems/Steam.js);
    # 'papers' col0, row0, col1, row1, n (n loose sheets dropped in that inclusive tile rectangle, systems/Papers.js);
    # 'beds' col, row, deg (flattened cardboard painted on the ground, for a patron at the 'sleep' pastime)
    def dress(self, kind, *v):
        v = [*self.rect(*v[:4]), *v[4:]] if kind == 'papers' else [*self.at(*v[:2]), *v[2:]]
        self.street.setdefault(kind, []).append(v)

    # ---- the life of a room painted into its floor (render/FloorWear.js): n marks of `kind` (rings, sticky, butts,
    # shells, napkin, stain, burns...) somewhere in the inclusive tile rectangle; a path worn by feet from one point to
    # another, w px wide; the cigarettes' haze hanging under a lamp at (col, row), r tiles across (systems/Smoke.js)
    def grime(self, kind, col0, row0, col1, row1, n, **o):
        self.grimes.append([kind, *self.rect(col0, row0, col1, row1), n, *([o] if o else [])])

    # one mark exactly at (col, row) (a ring worn round a stage: grime_at('halo', col, row, r=px, w=px))
    def grime_at(self, kind, cx, cy, **o):
        x, y = self.at(cx, cy)
        self.grimes.append([kind, x, y, x, y, 1, {**o, 'at': 'point'}])

    # ---- small things lying loose on a floor (src/game/systems/Litter.js, data/litter.js LITTER): n of `kind` thrown
    # round (col, row) between r0 and r1 px from it, thicker toward r0 (`arc`: (deg0, deg1), only that way round), never
    # in a wall nor under a piece of furniture already placed; `looks`: the odds of each of the kind's sprites. The
    # scatter is done in the level's coordinates (after the cuts), seeded: the same every build.
    def litter(self, kind, col, row, r0, r1, n, looks=(1,), arc=None, seed=1):
        rng = random.Random(seed)
        cx, cy = self.at(col, row)
        laid = tries = 0
        while laid < n and tries < n * 40:
            tries += 1
            a = math.radians(rng.uniform(*arc) if arc else rng.uniform(0, 360))
            d = (r0 + (r1 - r0) * rng.random() ** 1.8) / 32
            x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
            if not self.free_floor(x, y):
                continue
            look = rng.choices(range(len(looks)), weights=looks)[0]
            self.litters.append([kind, round(x, 3), round(y, 3), rng.randrange(360), look])
            laid += 1
        assert laid == n, f'only {laid} of {n} {kind} round {col},{row}'

    # one of them at (col, row), turned deg
    def litter_at(self, kind, col, row, deg=0, look=0):
        x, y = self.at(col, row)
        assert self.free_floor(x, y), f'{kind} at {col},{row} is not on free floor'
        self.litters.append([kind, x, y, deg, look])

    # a point of floor (the level's tiles) in no wall and under no piece of furniture (round ones by their circle),
    # 3 px from any other piece of litter
    def free_floor(self, x, y):
        t = self.tiles[int(y)][int(x)]
        if t in SOLID or t in 'DLG':
            return False
        for (_, kind, col, row, deg, _) in self.props:
            if SIZES.get(kind) is None:
                continue
            if kind in ROUND:
                if math.hypot(x - col, y - row) < SIZES[kind][0] / 64 + 0.03:
                    return False
                continue
            b = self.box(kind, col, row, deg)
            if b[0] - 0.03 < x < b[2] + 0.03 and b[1] - 0.03 < y < b[3] + 0.03:
                return False
        return all(math.hypot(x - q[1], y - q[2]) >= 3 / 32 for q in self.litters)

    def wear_path(self, col0, row0, col1, row1, w=12):
        self.worn.append([*self.at(col0, row0), *self.at(col1, row1), w])

    def smoke_haze(self, col, row, r, density):
        self.haze.append([*self.at(col, row), r, density])

    # ---- what a place sounds like (src/game/data/soundscape.js ZONES): its kind over an inclusive tile rectangle, the
    # first given wins where two overlap; a tile in none is a street, a roof or a room by its floor. place: what the
    # guards call it when it is not its kind's name (a PLACES key of src/game/data/barks.js)
    def sound(self, kind, col0, row0, col1, row1, place=None):
        self.zones.append([kind, *self.rect(col0, row0, col1, row1), *([place] if place else [])])

    # ---- a room open to the public (inclusive tile rectangle): a stranger may hang about there
    def host(self, col0, row0, col1, row1):
        self.welcome.append(self.rect(col0, row0, col1, row1))

    # ---- a bed heard from one tile (src/game/data/soundscape.js SPOTS: a radio behind a window)
    def sound_spot(self, bed, col, row):
        self.spots.append([bed, *self.tile(col, row, 'sound spot')])

    # ---- rooftop dressing: scenery on the flat roofs of the neighbouring buildings
    def roof(self, kind, col, row, deg=0):
        self.roofs.append((self._area, kind, *self.at(col, row), deg))

    def is_wall(self, x, y):
        return not (0 <= x < self.w and 0 <= y < self.h) or self.tiles[y][x] in WALLS

    # same rule as TileMap.isRoof: brick with nothing but walls around it
    def is_roof(self, x, y):
        inside = 0 <= x < self.w and 0 <= y < self.h
        return inside and self.tiles[y][x] == 'X' and all(self.is_wall(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1))

    def check_roofs(self):
        boxes = []
        for (_, kind, col, row, deg) in self.roofs:
            assert kind in ROOF_SIZES, f'unknown roof piece {kind}'
            b = self.box(kind, col, row, deg, ROOF_SIZES)
            for y in range(math.floor(b[1] + 0.02), math.floor(b[3] - 0.02) + 1):
                for x in range(math.floor(b[0] + 0.02), math.floor(b[2] - 0.02) + 1):
                    assert self.is_roof(x, y), f'{kind} at {col},{row} is off the roof ({x},{y})'
            for (ok, ob) in boxes:
                apart = b[0] >= ob[2] - 0.01 or ob[0] >= b[2] - 0.01 or b[1] >= ob[3] - 0.01 or ob[1] >= b[3] - 0.01
                assert apart, f'{kind} at {col},{row} overlaps {ok}'
            boxes.append((kind, b))
            if kind in ROOF_GLOW:
                # its glow is not shadowed: it must stay on the roof and its parapet, never spill on the street
                r, off = ROOF_GLOW[kind]
                a = math.radians(deg)
                gx, gy, r = col - off / 32 * math.sin(a), row + off / 32 * math.cos(a), r / 32
                for y in range(math.floor(gy - r), math.floor(gy + r) + 1):
                    for x in range(math.floor(gx - r), math.floor(gx + r) + 1):
                        d = math.hypot(gx - min(max(gx, x), x + 1), gy - min(max(gy, y), y + 1))
                        assert d >= r or self.is_wall(x, y), f'the glow of {kind} at {col},{row} spills on ({x},{y})'

    # ---- checks
    @staticmethod
    def box(kind, col, row, deg, sizes=SIZES):
        w, h = sizes[kind]
        if round(deg) % 180 == 90:
            w, h = h, w
        elif round(deg) % 90:
            w = h = max(w, h)
        return (col - w / 64, row - h / 64, col + w / 64, row + h / 64)

    def check(self, guards=None):
        boxes = []
        for (_, kind, col, row, deg, _) in self.props:
            assert kind in SIZES, f'unknown prop {kind}'
            if SIZES[kind] is None:
                continue
            b = self.box(kind, col, row, deg)
            for y in range(int(b[1] + 0.02), int(b[3] - 0.02) + 1):
                for x in range(int(b[0] + 0.02), int(b[2] - 0.02) + 1):
                    t = self.tiles[y][x]
                    assert t not in SOLID and t not in 'DLG', f'{kind} at {col},{row} is in {t!r} ({x},{y})'
            for (ok, ob) in boxes:
                # a bar is made of touching modules
                if kind == ok == 'bar_counter':
                    continue
                apart = b[0] >= ob[2] - 0.01 or ob[0] >= b[2] - 0.01 or b[1] >= ob[3] - 0.01 or ob[1] >= b[3] - 0.01
                assert apart, f'{kind} at {col},{row} overlaps {ok}'
            for (sx, sy) in self.spawns:
                clear = not (b[0] - 0.27 < sx < b[2] + 0.27 and b[1] - 0.27 < sy < b[3] + 0.27)
                assert clear, f'{kind} at {col},{row} on a spawn {sx},{sy}'
            boxes.append((kind, b))
        for (_, kind, col, row, deg, _) in self.props:
            if kind in ON_WALL:
                self.check_on_wall(kind, col, row, deg)
        n = sum(ch.lower() in GUARDS for row in self.actors for ch in row if ch.isalpha())
        assert guards is None or n == guards, f'{n} guards, expected {guards}'
        self.check_roofs()

    # a piece on a wall face: the wall it hangs on (the nearer tile edge across its depth), along its length (4 px of
    # play), is no doorway
    def check_on_wall(self, kind, col, row, deg):
        half = ON_WALL[kind] / 64
        if round(deg) % 180 == 90:
            x = round(col) if col < round(col) else round(col) - 1
            cells = [(x, y) for y in range(math.floor(row - half + 0.12), math.floor(row + half - 0.12) + 1)]
        else:
            y = round(row) if row < round(row) else round(row) - 1
            cells = [(x, y) for x in range(math.floor(col - half + 0.12), math.floor(col + half - 0.12) + 1)]
        for (x, y) in cells:
            if 0 <= x < self.w and 0 <= y < self.h:
                assert self.tiles[y][x] not in 'DL', f'{kind} at {col},{row} hangs across the doorway at {x},{y}'

    # ---- output: src/game/data/levels/<module>.js
    def write(self, module, header, name, subtitle, exit=None, passive=False, lights=(), ambient=None, objective=None,
              light=None):
        assert not (self.tutorial and (self.cut_x or self.cut_y)), 'a tutorial is not moved by the cuts'
        # what the builder hands over in its own coordinates
        if exit:
            exit = {**exit, 'x': self.X(exit['x']), 'y': self.Y(exit['y'])}
            if 'route' in exit:
                exit['route'] = [list(self.at(*q)) for q in exit['route']]
        lights = [[*self.at(*l[:2]), *l[2:]] for l in lights]
        if ambient:
            ambient = {**ambient, 'traffic': [{**t, 'row': self.Y(t['row'])} for t in ambient.get('traffic', [])],
                       'walkers': [{**w, 'path': [list(self.at(*q)) for q in w['path']]} for w in ambient.get('walkers', [])]}
        L = ['// ' + h for h in header]
        L.append(f'// Generated by tools/build_{module}.py (edit the script: it checks spawns and furniture overlaps), 1 tile = 1 m.')
        L.append('// tiles legend: see src/game/world/TileMap.js (FLOORS/WALLS) - D door, L locked door, G window.')
        L.append('// actors legend: @ player | p u s h r b k guards (UPPERCASE = patrols) | 1-9 weapons | x c t barrel, crate, bin')
        L.append('//                n z = 9mm, v w = 7.62, g = 12 gauge, q = rocket.')
        L.append('// props: [type, col, row, deg, options?] - lights: false = a parked vehicle with its lights off.')
        L.append('export default {')
        L.append(f'  name: {js(name)},')
        L.append(f'  subtitle: {js(subtitle)},')
        if objective:
            L.append(f'  objective: [{js(objective[0])}, {js(objective[1])}],')
        if passive:
            L.append('  passive: true,')
        if exit:
            # route / radius / fade: the getaway's way out (systems/Outro.js), tiles
            more = ''.join(f', {k}: {json.dumps(exit[k])}' for k in ('route', 'radius', 'fade') if k in exit)
            L.append(f"  exit: {{ x: {exit['x']}, y: {exit['y']}, r: {exit['r']}{more} }},")
        if self.facing:
            L.append('  facing: { ' + ', '.join(f"'{k}': {v}" for k, v in self.facing.items()) + ' },')
        if self.patrols:
            L.append('  patrols: {')
            L += [f"    '{k}': {json.dumps(v)}," for k, v in self.patrols.items()]
            L.append('  },')
        if self.jobs:
            L.append('  jobs: { ' + ', '.join(f"'{k}': '{v}'" for k, v in self.jobs.items()) + ' },')
        if self.looks:
            L.append('  looks: { ' + ', '.join(f"'{k}': '{v}'" for k, v in self.looks.items()) + ' },')
        if self.awake:
            L.append("  // in a passive level, the guards who still see and hear (by their tile 'col,row')")
            L.append(f'  awake: {js(self.awake)},')
        L.append('  tiles: [')
        L += [f'    {json.dumps("".join(r))},' for r in self.tiles]
        L.append('  ],')
        L.append('  actors: [')
        L += [f'    {json.dumps("".join(r).rstrip())},' for r in self.actors]
        L.append('  ],')
        L.append('  props: [')
        cur, line = None, ''
        for (a, kind, col, row, deg, opt) in self.props:
            if a != cur:
                if line:
                    L.append('   ' + line)
                L.append(f'    // {a}')
                cur, line = a, ''
            o = ', { ' + ', '.join(f'{k}: {js(v).lower()}' for k, v in opt.items()) + ' }' if opt else ''
            item = f" ['{kind}', {col:g}, {row:g}, {deg:g}{o}],"
            if len(line) + len(item) > 116:
                L.append('   ' + line)
                line = ''
            line += item
        if line:
            L.append('   ' + line)
        L.append('  ],')
        if self.premises:
            L.append('  // guarded premises [col0, row0, col1, row1]: outside, guards ignore the player until he gives himself away')
            L.append(f'  premises: {json.dumps(self.premises)},')
        if self.music:
            L.append(f"  music: '{self.music}',")
        if self.intro:
            L.append(f"  intro: '{self.intro}',")
        if self.welcome:
            L.append('  // rooms open to the public: a stranger may hang about there, no guard tells him to clear off')
            L.append(f'  welcome: {json.dumps(self.welcome)},')
        if self.floor:
            L.append('  // painted on the floor, no body: [sprite, col, row, deg]')
            L.append(f'  floor: {js(self.floor)},')
        if self.fires:
            L.append('  // fires [col, row, tutorial stage they catch at] (src/game/systems/Fires.js)')
            L.append(f'  fires: {json.dumps(self.fires)},')
        if self.bodies:
            L.append('  // already dead when it starts [kind, col, row, deg, pool px]')
            L.append(f'  bodies: {json.dumps(self.bodies)},')
        if self.drops:
            L.append('  // weapons lying about [type, col, row, deg, rounds in it (null: full)]')
            L.append(f'  drops: {json.dumps(self.drops)},')
        if self.tutorial:
            L.append('  // a level that teaches: its stages and the way out (src/game/systems/Tutorial.js)')
            L.append(f'  tutorial: {json.dumps(self.tutorial)},')
        if self.leans:
            L.append('  // weapons stood against a wall [type, col, row, deg]')
            L.append(f'  lean: {json.dumps(self.leans)},')
        if self.alarms:
            L.append('  // closed shops: breaking in (a window, the door, a wall, or just standing on its floor) rings the box')
            L.append(f'  alarms: {json.dumps(self.alarms)},')
        if self.mains:
            L.append('  // the fuse box and the tile rectangle it feeds: smashed, only the emergency lamps are left inside')
            L.append(f'  power: {json.dumps(self.mains)},')
        if self.devices:
            L.append('  // the devices of the level (data/devices.js): the fire alarm and the rooms it rains on and')
            L.append('  // the trapdoors of the passage under the street')
            for k, v in self.devices.items():
                L.append(f'  {k}: {json.dumps(v)},')
        if self.leaves:
            L.append('  // door leaves in no wall (a toilet stall\'s): [col, row (the hinge), deg, length px, sprite]')
            L.append(f'  leaves: {json.dumps(self.leaves)},')
        if self.bars:
            L.append('  // windows with iron bars outside the glass: nobody goes through them (entities/Window.js)')
            L.append(f'  bars: {json.dumps(self.bars)},')
        if self.wet is not None:
            L.append('  // how wet the open ground is from an earlier rain (systems/Weather.js: puddles, sheen)')
            L.append(f'  wet: {self.wet},')
        if self.zones or self.rain:
            L.append('  // what each place sounds like (data/soundscape.js): rain 0..1, zones [kind, col0, row0, col1, row1, place?] (the')
            L.append("  // first wins; place: the guards' name for it, data/barks.js PLACES, when not its kind's)")
            L.append(f"  soundscape: {{ rain: {self.rain or 0}, zones: {js(self.zones)} }},")
        if self.grimes or self.worn:
            L.append('  // the life of the rooms on their floors (render/FloorWear.js): grime [kind, col0, row0, col1, row1, n, options?],')
            L.append('  // paths worn by feet [col0, row0, col1, row1, width px]')
            if self.grimes:
                L.append(f'  grime: {js(self.grimes)},')
            if self.worn:
                L.append(f'  worn: {json.dumps(self.worn)},')
        if self.haze:
            L.append('  // cigarette haze hanging under the lamps (systems/Smoke.js): [col, row, radius tiles, density]')
            L.append(f'  haze: {json.dumps(self.haze)},')
        if self.litters:
            L.append('  // small things lying loose on the floor (systems/Litter.js): [kind, col, row, deg, look]')
            L.append('  litter: [')
            for i in range(0, len(self.litters), 4):
                L.append('    ' + ' '.join(json.dumps(q) + ',' for q in self.litters[i:i + 4]))
            L.append('  ],')
        if self.critters:
            L.append('  // street fauna: flocks of pigeons [col, row, n], cats [col, row] (rats, flies and moths need no data)')
            L.append(f'  critters: {json.dumps(self.critters)},')
        if self.spots:
            L.append('  // beds heard from one tile (data/soundscape.js SPOTS): [bed, col, row]')
            L.append(f'  soundSpots: {js(self.spots)},')
        if self.street:
            L.append('  // street dressing without a body: manholes [col, row], papers [col0, row0, col1, row1, n], beds [col, row, deg]')
            L.append(f'  street: {json.dumps(self.street)},')
        if self.roofs:
            L.append('  // rooftops of the neighbouring buildings (data/roofs.js): [kind, col, row, deg], scenery on the wall layer')
            L.append('  roof: [')
            cur, line = None, ''
            for (a, kind, col, row, deg) in self.roofs:
                if a != cur:
                    if line:
                        L.append('   ' + line)
                    L.append(f'    // {a}')
                    cur, line = a, ''
                item = f" ['{kind}', {col:g}, {row:g}, {deg:g}],"
                if len(line) + len(item) > 116:
                    L.append('   ' + line)
                    line = ''
                line += item
            if line:
                L.append('   ' + line)
            L.append('  ],')
        if lights:
            L.append('  // indirect fill only: every visible light is a prop (lamps, signs, tubes, headlights)')
            L.append('  lights: [')
            L += [f'    {js(l)},' for l in lights]
            L.append('  ],')
        if light:
            L.append('  // night tint per area over LIGHTING.ambient (render/Lighting.js ambientOf)')
            L.append(f'  light: {js(light)},')
        if ambient:
            L.append('  // street life (systems/Ambient.js): traffic lanes and passers-by')
            L.append('  ambient: {')
            L.append('    traffic: [')
            for t in ambient.get('traffic', []):
                L.append(f"      {{ row: {t['row']}, dir: {t['dir']}, speed: {t['speed']}, gap: {t['gap']}, models: {js(t['models'])} }},")
            L.append('    ],')
            L.append('    walkers: [')
            for w in ambient.get('walkers', []):
                L.append(f"      {{ path: {json.dumps(w['path'])}, gap: {w['gap']}, max: {w['max']} }},")
            L.append('    ],')
            if self.patrons:
                L.append('    // customers posted indoors: [sprite, col, row, deg, pastime]')
                L.append('    patrons: [')
                L += [f'      {js(p)},' for p in self.patrons]
                L.append('    ],')
            L.append('  },')
        L.append('};')
        out = os.path.join(ROOT, 'src', 'game', 'data', 'levels', module + '.js')
        with open(out, 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(L) + '\n')
        print(f'wrote {out}: {self.w}x{self.h} tiles, {len(self.props)} props, {len(self.roofs)} roof pieces')
