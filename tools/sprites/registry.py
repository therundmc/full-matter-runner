"""The sprite registry: every kit's SPRITES in one table, how a sprite is painted, and what is generated from it.

A kit is a module of this package that paints a family of sprites and lists them in SPRITES, beside its GROUP (its
folder under assets/sprites/):
    SPRITES = {name: (painter, size, flags[, box])}
- name: the sprite's name in the kit's GROUP, or 'group/name' for another group;
- painter: called with no argument, returns the canvas (core.Cv), or (canvas, emissive map) for a 'glow' sprite;
- size: in world px (a FINE sprite's PNG has FINE times as many pixels a side: 13.5 is 27 of them);
- flags, words in a string:
    fine   painted at FINE density through core.fine() (finer canvases, the ink softened on the lit side, a grain)
    dense  at FINE density too, painted so by the painter itself (the people, the weapons, the floors, the fauna)
    glow   the painter returns (sprite, emissive map): <name>_glow is written beside it, at its size and density
    floor  floor paint, laid flat on the ground by a level (tools/levelkit.py FLOOR): no body
    req    loaded up front by the game (engine/Assets.js SPRITE_LIST); the others, and the emissive maps, are
           optional (OPTIONAL_LIST)
    stock  painted and loaded, placed by no level yet: kept for the levels to come (tests/sprites.test.mjs)
    hung   a prop that hangs on a wall or from a ceiling: never in the way of the furniture (levelkit SIZES None)
- box: a prop's hitbox in px as the level builder checks it (levelkit SIZES; keep in step with
  src/game/data/props.js); a prop with neither a box nor `hung` cannot be placed by a level.

Generated from it (by tools/generate_assets.py, never edited by hand): src/engine/spritelist.js (what the game loads
and at which density) and tools/sprite_tables.py (levelkit's SIZES, FLOOR and ROOF_SIZES).
"""
import importlib
from collections import namedtuple

from .core import FINE, fine

KITS = ('characters', 'items', 'weapons', 'furniture', 'tiles', 'vehicles', 'palms', 'street', 'shops', 'details',
        'lab_labels', 'clutter', 'barwall', 'lights', 'roofs', 'doors', 'critters', 'street2a', 'road', 'ramp_toll',
        'billboards', 'deco', 'flat', 'interiors', 'alley', 'miami', 'suburb')
FLAGS = {'fine', 'dense', 'glow', 'floor', 'req', 'stock', 'hung'}
# the grain of a fine sprite is seeded by its name (a clutter piece's prefixed with the group, as it always was)
GRAIN = dict(clutter='clutter_')
# painted by another generator (tools/generate_comic.py), loaded by nothing yet: art for a future menu
OTHER_STOCK = ('comic/target_cueball', 'comic/target_lucky', 'comic/target_jitters', 'comic/target_boss',
               'comic/card_runner')


class Sprite(namedtuple('Sprite', 'kit group name painter size flags box')):
    @property
    def path(self):
        return self.group + '/' + self.name

    @property
    def k(self):
        """Its pixels per world px."""
        return FINE if self.flags & {'fine', 'dense'} else 1

    @property
    def png(self):
        """Its PNG's size in pixels."""
        w, h = self.size[0] * self.k, self.size[1] * self.k
        assert w == int(w) and h == int(h), '%s: %s world px is not a whole number of pixels' % (self.path, self.size)
        return int(w), int(h)

    @property
    def files(self):
        """The paths it is written to: itself, and its emissive map."""
        return [self.path] + ([self.path + '_glow'] if 'glow' in self.flags else [])


_REG = {}


def sprites(kits=KITS):
    """{path: Sprite} of the kits, in their order (each kit's in its own)."""
    key = tuple(kits)
    if key in _REG:
        return _REG[key]
    out = {}
    for kit in kits:
        mod = importlib.import_module('.' + kit, __package__)
        for key_, entry in mod.SPRITES.items():
            painter, size, flags = entry[:3]
            box = entry[3] if len(entry) > 3 else None
            group, name = key_.split('/') if '/' in key_ else (mod.GROUP, key_)
            fl = frozenset(flags.split())
            assert fl <= FLAGS, '%s/%s: unknown flags %s' % (group, name, sorted(fl - FLAGS))
            assert not ({'fine', 'dense'} <= fl), '%s/%s: fine or dense, not both' % (group, name)
            assert not (box and 'hung' in fl), '%s/%s: hung, with a box' % (group, name)
            sp = Sprite(kit, group, name, painter, tuple(size), fl, tuple(box) if box else None)
            for f in sp.files:
                assert f not in out, '%s painted by %s and %s' % (f, out[f].kit if f in out else '?', kit)
            out[sp.path] = sp
    _REG[key] = out
    return out


def paint(sp):
    """[(path, canvas)] of a sprite: itself, then its emissive map; their sizes checked."""
    r = fine(sp.painter, GRAIN.get(sp.group, '') + sp.name) if 'fine' in sp.flags else sp.painter()
    glow = 'glow' in sp.flags
    assert isinstance(r, tuple) == glow, '%s: %s' % (sp.path, 'no emissive map' if glow else 'an emissive map, no glow flag')
    out = list(zip(sp.files, r if glow else (r,)))
    for path, cv in out:
        assert cv.img.size == sp.png, '%s is %s, expected %s' % (path, cv.img.size, sp.png)
        assert cv.img.mode == 'RGBA', path
    return out


def batch_of(sp):
    """What is painted with it in one call (a Batch's sprites), or itself."""
    return getattr(sp.painter, 'batch', sp.path)


# ---- what is generated from the registry

GENERATED = 'GENERATED by tools/generate_assets.py from the sprite registry (tools/sprites/registry.py): never edit by hand.'


def js_list(name, paths, wrap='%s', indent='  '):
    rows, row = [], indent
    for p in paths:
        item = "'%s', " % p
        if len(row) + len(item) > 120:
            rows.append(row.rstrip())
            row = indent
        row += item
    rows.append(row.rstrip().rstrip(','))
    return 'export const %s = %s;\n' % (name, wrap % ('[\n%s,\n]' % '\n'.join(rows) if paths else '[]'))


def spritelist_js(reg):
    """src/engine/spritelist.js: the sprites engine/Assets.js loads (group/name under assets/sprites/)."""
    files = [(f, sp) for sp in reg.values() for f in sp.files]
    req = [sp.path for sp in reg.values() if 'req' in sp.flags]          # (their emissive maps are optional)
    opt = [f for f, sp in files if f not in req]
    fine_ = [f for f, sp in files if sp.k != 1]
    stock = [sp.path for sp in reg.values() if 'stock' in sp.flags] + list(OTHER_STOCK)
    return ('// ' + GENERATED + '\n'
            '// The sprites engine/Assets.js loads, group/name under assets/sprites/: REQUIRED up front (a placeholder '
            'if one is\n// missing), OPTIONAL when there; FINE: those painted at twice the world\'s pixel density '
            '(drawn at half size); STOCK:\n// painted, placed by no level yet (kept for the levels to come, '
            'tests/sprites.test.mjs).\n'
            + js_list('REQUIRED', req) + js_list('OPTIONAL', opt)
            + js_list('FINE', fine_, 'new Set(%s)') + js_list('STOCK', stock))


def py_tuple(t):
    return '(%s)' % ', '.join('%g' % v for v in t)


def py_rows(head, items, indent):
    rows, row = [], head
    for it in items:
        if len(row) + len(it) + 2 > 120:
            rows.append(row.rstrip())
            row = indent
        row += it + ', '
    rows.append(row.rstrip().rstrip(','))
    return '\n'.join(rows)


def sprite_tables_py(reg):
    """tools/sprite_tables.py: what the level builder (tools/levelkit.py) knows of the sprites."""
    props = [sp for sp in reg.values() if sp.group == 'props']
    sizes = ['%s=%s' % (sp.name, py_tuple(sp.box) if sp.box else 'None') for sp in props if sp.box or 'hung' in sp.flags]
    floor = ["'%s'" % sp.name for sp in props if 'floor' in sp.flags]
    roof = ['%s=%s' % (sp.name, py_tuple(sp.size)) for sp in reg.values() if sp.group == 'roof']
    return ('"""%s\n\nWhat tools/levelkit.py knows of the sprites: a prop\'s hitbox in px (SIZES, None: it hangs on a '
            'wall or from a\nceiling, never in the way), the floor paint (FLOOR), the rooftop dressing\'s size in px '
            '(ROOF_SIZES)."""\n' % GENERATED
            + py_rows('SIZES = dict(', sizes, '             ') + ')\n'
            + py_rows('FLOOR = (', floor, '         ') + ')\n'
            + py_rows('ROOF_SIZES = dict(', roof, '                  ') + ')\n')
