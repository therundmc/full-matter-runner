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
    hydrant=(8, 8), bench=(50, 15), palm_tree=(9, 9), streetlight=(6, 6), floor_lamp=(10, 10), table_lamp=(15, 15),
    car=(136, 54), car2=(130, 52), van=(156, 60), chain_fence=(32, 4), bottle_shelf=(40, 11), back_bar=(40, 8), washer=(22, 22),
    neon_sign_liquor=None, neon_sign_video=None, neon_sign_wash=None, alarm_box=None,
    marquee=None, neon_sign_bar=None, neon_sign_palm=None, neon_sign_arrow=None, wall_lamp=None, tube_light=None,
    neon_tube_pink=None, neon_tube_cyan=None, ceiling_lamp=None, pool_lamp=None, string_lights=None,
    ceiling_fan=None, mirror_ball=None, extinguisher=None,
    ladder=(30, 30), parapet=(32, 10),
    vending=(26, 20), phone_booth=(24, 24), parking_meter=(5, 5), news_box=(14, 11), pipe_steam=None, pipe_water=None, wall_vent=None,
)

# rooftop dressing in px (keep in sync with ROOF_SIZES in tools/generate_assets.py)
ROOF_SIZES = dict(ac_unit=(46, 32), vent=(14, 14), duct=(64, 12), hatch=(22, 22), chimney=(20, 20), tank=(50, 50),
                  antenna=(34, 34), bulkhead=(62, 54), skylight=(46, 30), skylight_tv=(46, 30), skylight_dark=(46, 30))
# the lit ones: (radius, offset along the piece's +y) of their glow in px (keep in sync with src/game/data/roofs.js)
ROOF_GLOW = dict(bulkhead=(56, 30), skylight=(62, 0), skylight_tv=(54, 0))


def js(v):
    return json.dumps(v).replace('"', "'")


class Level:
    def __init__(self, w, h, base='X'):
        self.w, self.h = w, h
        self.tiles = [[base] * w for _ in range(h)]
        self.actors = [[' '] * w for _ in range(h)]
        self.props = []       # (area, type, col, row, deg, options)
        self.roofs = []       # (area, kind, col, row, deg)
        self.premises = []    # guarded tile rectangles [col0, row0, col1, row1]
        self.welcome = []     # rectangles where a stranger is a customer: guards never tell him to clear off
        self.intro = None     # 'sit': the player starts sitting on the ground and gets up at the first key
        self.alarms = []      # closed shops: { rect: floor rectangle, box: [col, row] of the alarm box }
        self.critters = {}    # street fauna: { pigeons: [[col, row, n]], cats: [[col, row]] }
        self.street = {}      # dressing without a body: { manholes: [[col, row]], papers: [[col0, row0, col1, row1, n]] }
        self.facing = {}
        self.patrols = {}
        self.jobs = {}        # 'x,y' -> pastime of the guard posted there (src/game/ai/Pastimes.js)
        self.patrons = []     # [sprite, col, row, deg, pastime]: civilians posted indoors
        self.spawns = []      # centre of every character, for the overlap check
        self._area = ''

    # ---- tiles
    def fill(self, x0, y0, x1, y1, ch):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.tiles[y][x] = ch

    def put(self, x, y, ch):
        self.tiles[y][x] = ch

    # ---- actors: player, guards (UPPERCASE = patrols along `route`), weapons, ammo
    def actor(self, ch, x, y, face=None, route=None, job=None):
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
        if ch == '@' or ch.lower() in GUARDS:
            self.spawns.append((x + 0.5, y + 0.5))

    def patron(self, kind, x, y, deg, pastime):
        """A civilian posted indoors at (x, y) in tiles, facing deg, busy with `pastime`: he may sit on furniture."""
        assert self.tiles[int(y)][int(x)] not in SOLID | OPENINGS, f'patron in a wall at {x},{y}'
        self.patrons.append([kind, x, y, deg, pastime])

    # ---- props: `area` names the group they are listed under in the output
    def area(self, name):
        self._area = name

    def prop(self, kind, col, row, deg=0, **opt):
        self.props.append((self._area, kind, col, row, deg, opt))

    # ---- guarded premises (inclusive tile rectangle): guards leave an unarmed stranger alone anywhere else
    def guard(self, col0, row0, col1, row1):
        self.premises.append([col0, row0, col1, row1])

    # ---- a closed shop (inclusive tile rectangle of its floor) whose alarm box hangs at (col, row) on its front
    def alarm(self, col0, row0, col1, row1, col, row, deg=0):
        self.alarms.append(dict(rect=[col0, row0, col1, row1], box=[col, row]))
        self.prop('alarm_box', col, row, deg)

    # ---- street fauna (systems/Critters.js): a flock of n pigeons pecking about (col, row), a cat sitting at (col, row)
    def pigeons(self, col, row, n):
        self.fauna('pigeons', col, row, n)

    def cat(self, col, row):
        self.fauna('cats', col, row)

    def fauna(self, kind, col, row, *more):
        t = self.tiles[int(row)][int(col)]
        assert t not in SOLID and t not in 'DLG', f'{kind} at {col},{row} in {t!r}'
        self.critters.setdefault(kind, []).append([col, row, *more])

    # ---- street dressing without a body: 'manholes' col, row (a cover breathing steam, systems/Steam.js);
    # 'papers' col0, row0, col1, row1, n (n loose sheets dropped in that inclusive tile rectangle, systems/Papers.js);
    # 'beds' col, row, deg (flattened cardboard painted on the ground, for a patron at the 'sleep' pastime)
    def dress(self, kind, *v):
        self.street.setdefault(kind, []).append(list(v))

    # ---- a room open to the public (inclusive tile rectangle): a stranger may hang about there
    def host(self, col0, row0, col1, row1):
        self.welcome.append([col0, row0, col1, row1])

    # ---- rooftop dressing: scenery on the flat roofs of the neighbouring buildings
    def roof(self, kind, col, row, deg=0):
        self.roofs.append((self._area, kind, col, row, deg))

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
        n = sum(ch.lower() in GUARDS for row in self.actors for ch in row if ch.isalpha())
        assert guards is None or n == guards, f'{n} guards, expected {guards}'
        self.check_roofs()

    # ---- output: src/game/data/levels/<module>.js
    def write(self, module, header, name, subtitle, exit=None, passive=False, lights=(), ambient=None, objective=None):
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
            L.append(f"  exit: {{ x: {exit['x']}, y: {exit['y']}, r: {exit['r']} }},")
        if self.facing:
            L.append('  facing: { ' + ', '.join(f"'{k}': {v}" for k, v in self.facing.items()) + ' },')
        if self.patrols:
            L.append('  patrols: {')
            L += [f"    '{k}': {json.dumps(v)}," for k, v in self.patrols.items()]
            L.append('  },')
        if self.jobs:
            L.append('  jobs: { ' + ', '.join(f"'{k}': '{v}'" for k, v in self.jobs.items()) + ' },')
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
        if self.intro:
            L.append(f"  intro: '{self.intro}',")
        if self.welcome:
            L.append('  // rooms open to the public: a stranger may hang about there, no guard tells him to clear off')
            L.append(f'  welcome: {json.dumps(self.welcome)},')
        if self.alarms:
            L.append('  // closed shops: breaking in (a window, the door, a wall, or just standing on its floor) rings the box')
            L.append(f'  alarms: {json.dumps(self.alarms)},')
        if self.critters:
            L.append('  // street fauna: flocks of pigeons [col, row, n], cats [col, row] (rats, flies and moths need no data)')
            L.append(f'  critters: {json.dumps(self.critters)},')
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
