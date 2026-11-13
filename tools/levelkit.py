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
    lv.check(guards=13)
    lv.write('level1', header=[...], name='...', subtitle='...')

Legends: tiles in src/game/world/TileMap.js, actors in src/game/world/Level.js, props in src/game/data/props.js.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOLID = set(' #X')
OPENINGS = set('DLGF')
GUARDS = set('pushrbk')

# hitboxes in px (keep in sync with src/game/data/props.js and Vehicle.js)
# None = hangs from the ceiling / sits on a wall: never in the way
SIZES = dict(
    table=(44, 26), table_round=(28, 28), desk=(46, 24), chair=(14, 14), armchair=(26, 26), sofa=(64, 28),
    plant=(15, 15), tv=(22, 15), fridge=(22, 22), oven=(20, 20), sink=(26, 18), toilet=(13, 21), bed=(44, 64),
    pool_table=(80, 44), arcade=(22, 27), crate=(19, 19), barrel=(18, 18), bookshelf=(40, 11), speaker=(14, 14),
    dj_booth=(58, 22), bar_counter=(32, 19), dumpster=(58, 34), trash_can=(15, 15), jukebox=(28, 20),
    hydrant=(8, 8), bench=(50, 15), palm_tree=(9, 9), streetlight=(6, 6), floor_lamp=(10, 10), table_lamp=(15, 15),
    car=(136, 54), car2=(130, 52), van=(156, 60),
    marquee=None, neon_sign_bar=None, neon_sign_palm=None, neon_sign_arrow=None, wall_lamp=None, tube_light=None,
    neon_tube_pink=None, neon_tube_cyan=None, ceiling_lamp=None, pool_lamp=None, string_lights=None,
)


def js(v):
    return json.dumps(v).replace('"', "'")


class Level:
    def __init__(self, w, h, base='X'):
        self.w, self.h = w, h
        self.tiles = [[base] * w for _ in range(h)]
        self.actors = [[' '] * w for _ in range(h)]
        self.props = []       # (area, type, col, row, deg, options)
        self.facing = {}
        self.patrols = {}
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
    def actor(self, ch, x, y, face=None, route=None):
        t = self.tiles[y][x]
        assert t not in SOLID and t not in OPENINGS, f'actor {ch} on a solid tile at {x},{y}'
        assert self.actors[y][x] == ' ', f'two actors at {x},{y}'
        self.actors[y][x] = ch
        if face is not None:
            self.facing[f'{x},{y}'] = face
        if route:
            self.patrols[f'{x},{y}'] = route
        if ch == '@' or ch.lower() in GUARDS:
            self.spawns.append((x + 0.5, y + 0.5))

    # ---- props: `area` names the group they are listed under in the output
    def area(self, name):
        self._area = name

    def prop(self, kind, col, row, deg=0, **opt):
        self.props.append((self._area, kind, col, row, deg, opt))

    # ---- checks
    @staticmethod
    def box(kind, col, row, deg):
        w, h = SIZES[kind]
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

    # ---- output: src/game/data/levels/<module>.js
    def write(self, module, header, name, subtitle, exit=None, passive=False, lights=(), ambient=None):
        L = ['// ' + h for h in header]
        L.append(f'// Generated by tools/build_{module}.py (edit the script: it checks spawns and furniture overlaps), 1 tile = 1 m.')
        L.append('// tiles legend: see src/game/world/TileMap.js (FLOORS/WALLS) - D door, L locked door, G window.')
        L.append('// actors legend: @ player | p u s h r b k guards (UPPERCASE = patrols) | 1-9 weapons | x c t barrel, crate, bin')
        L.append('//                n z = 9mm, v w = 7.62, g = 12 gauge, q = rocket.')
        L.append('// props: [type, col, row, deg, options?] - lights: false = a parked vehicle with its lights off.')
        L.append('export default {')
        L.append(f'  name: {js(name)},')
        L.append(f'  subtitle: {js(subtitle)},')
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
            L.append('  },')
        L.append('};')
        out = os.path.join(ROOT, 'src', 'game', 'data', 'levels', module + '.js')
        with open(out, 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(L) + '\n')
        print(f'wrote {out}: {self.w}x{self.h} tiles, {len(self.props)} props')
