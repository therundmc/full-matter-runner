"""What the cast holds, as meshes in model units (a head is 100: 1 unit is 2.3 mm) with the Skins that paint them:
bank notes and a banded brick of them, a torch (flashlight), a crowbar, a jerrycan. Put one in a hand with
Figure.hand_xf(side, place).at(point, rotation) (a hand's own space: wrist at the origin, fingers +y, palm +z).
"""
from .anatomy import smooth
from .kit import INK, hx
from .solid import Skin, box, merge, sheet, tube

# a hundred-dollar note: 156 x 66 mm
NOTE_W, NOTE_H = 68.0, 29.0
GREEN, GREEN_D, PAPER = hx('#5a9a72'), hx('#2a5a42'), hx('#c8dcb8')
BAND = hx('#d8c8a0')


def note_print(t, u, v, level):
    """The face of a note at (u, v) (0..1 across its length and its height): its pale margin, the framed green
    field, the portrait in its oval, the seals, the corner numbers. t: tones of 'paper', 'green', 'dark'."""
    if u < 0.035 or u > 0.965 or v < 0.08 or v > 0.92:
        return t['paper'][level]
    if u < 0.05 or u > 0.95 or v < 0.12 or v > 0.88:
        return t['dark'][level]
    ou, ov = (u - 0.5) / 0.15, (v - 0.5) / 0.36
    r = ou * ou + ov * ov
    if r < 1:
        if r > 0.72:
            return t['dark'][level]
        # the portrait: a head and shoulders in the oval
        if (ou / 0.5) ** 2 + ((ov + 0.22) / 0.55) ** 2 < 1 or (ov > 0.45 and abs(ou) < 0.9 - (ov - 0.45)):
            return t['dark'][level]
        return t['paper'][level]
    for cu, cv in ((0.13, 0.25), (0.87, 0.25), (0.13, 0.75), (0.87, 0.75)):
        if abs(u - cu) < 0.05 and abs(v - cv) < 0.11:
            return t['paper'][level] if abs(u - cu) > 0.018 or abs(v - cv) > 0.06 else t['dark'][level]
    if (u - 0.28) ** 2 / 0.003 + (v - 0.52) ** 2 / 0.016 < 1:
        return t['dark'][level]           # the seal
    if abs(v - 0.5) < 0.015 and 0.3 < u < 0.4:
        return t['dark'][level]
    return None


def money_tones(light):
    return dict(paper=light.tones(PAPER), green=light.tones(GREEN), dark=light.tones(GREEN_D), band=light.tones(BAND))


def brick(light, thick=12.0, length=NOTE_W, width=NOTE_H):
    """A brick of notes, banded across its middle: centred on its bottom face's middle, its length along y, its
    face up (+z). Returns (mesh, skin)."""
    t = money_tones(light)
    L, Wd = length, width

    def attr(p, face):
        return (p[0], p[1], p[2], face)

    def tex(a, level, n):
        x, y, z, face = a
        v = 0.5 + y / L                         # along the note's length
        if abs(v - 0.5) < 0.085:                # the paper band
            if abs(abs(v - 0.5) - 0.085) < 0.012:
                return INK
            if face == 'z1' and abs(v - 0.5) < 0.03 and abs(x) < Wd * 0.18:
                return t['dark'][level]         # its stamp
            return t['band'][level]
        if face == 'z1':
            return note_print(t, v, 0.5 + x / Wd, level) or t['green'][level]
        if face in ('x0', 'x1', 'y0', 'y1'):
            # the notes' edges, a few layers marked; paper never goes black
            lv = 'shade' if level == 'deep' else level
            k = z / thick
            if face in ('x0', 'x1') and any(abs(k - c) < 0.04 for c in (0.22, 0.5, 0.74)):
                return t['dark'][lv]
            return t['paper'][lv]
        return t['green'][level]
    m = box(-Wd / 2, -L / 2, 0.0, Wd / 2, L / 2, thick, attr=attr)
    return m, Skin(t['green']['lit'], t['green']['shade'], t['green']['deep'], tex=tex, t_lit=-0.15, blacks=False)


def riffled(light, n=5, lift=30.0, length=NOTE_W, width=NOTE_H):
    """The top notes of a brick riffled up at its far end (+y) by a thumb: n notes peeling off its top (z 0 here),
    each bent up from further back and higher, their ends fanned apart. Returns (mesh, skin)."""
    t = money_tones(light)
    meshes = []
    for i in range(n):
        k = (i + 1) / n
        v0 = 0.62 - 0.3 * k                   # where it leaves the brick
        rise = lift * (0.35 + 0.65 * k)

        def bend(u, v, v0=v0, rise=rise):
            w = smooth(v0, 1.0, v)
            return rise * w * w + 0.8 * (1 - w)
        m = sheet(width, length, bend=bend, n=(4, 14), attr=lambda u, v, side: (u, v, side), back=False)
        # each a little further along, its end curling back toward the thumb
        m.verts = [(p[0], p[1] - i * 2.2 * smooth(0.3, 1.0, p[1] / length + 0.5), p[2] + i * 0.6) for p in m.verts]
        meshes.append(m)

    def tex(a, level, n_):
        u, v, side = a
        if side == 'b':
            return t['paper'][level]
        if abs(v - 0.5) < 0.085:
            return t['green'][level]
        return note_print(t, v, u, level) or t['green'][level]
    return merge(meshes), Skin(t['green']['lit'], t['green']['shade'], t['green']['deep'], tex=tex, t_lit=-0.25, blacks=False)


def torch(light, on=True):
    """A torch (flashlight) along +y from its tail (0) to its head (70), its lens at the head. Returns
    [(mesh, skin)]."""
    body = tube([(0, 0, 0), (0, 44, 0)], lambda u, a: 5.2, n=12)
    head = tube([(0, 44, 0), (0, 56, 0), (0, 66, 0)], lambda u, a: 5.6 + 3.2 * smooth(0.3, 0.9, u), n=14,
                caps=(False, False))
    lens = tube([(0, 65.5, 0), (0, 67, 0)], lambda u, a: 8.4, n=14)
    metal = light.skin(hx('#3a3a44'), shine=0.5)
    glass = Skin(hx('#fff8e0'), hx('#fff8e0'), hx('#fff8e0'), ink=True) if on else light.skin(hx('#8a90a0'))
    return [(body, metal), (head, metal), (lens, glass)]


def crowbar(light, length=180.0):
    """A crowbar along +y: its straight shank from the claw (hooked back at y 0) to the flat end (y length)."""
    shank = tube([(0, 0, 0), (0, length, 0)], lambda u, a: 3.6, n=10)
    claw = tube([(0, 0, 0), (0, -8, 3), (0, -14, 10), (0, -12, 18)], lambda u, a: 3.6 - 1.2 * u, n=10)
    end = tube([(0, length, 0), (0, length + 8, -4)], lambda u, a: 3.4 - 0.8 * u, n=10, squash=lambda u: 1.6)
    paint = light.skin(hx('#9a2230'), tex=lambda a, level, n: None)
    return [(merge([shank, claw, end]), paint)]


def jerrycan(light):
    """A jerrycan standing on its base (y 0 up to -64), 46 wide (x), 22 deep (z), its handles on top, its spout
    capped; held by a handle at (0, -64, 0)."""
    t = light.tones(hx('#b02a34'))
    body = box(-23, -62, -11, 23, 0, 11, attr=lambda p, f: (p[0], p[1], p[2], f))

    def tex(a, level, n):
        x, y, z, f = a
        if f in ('z0', 'z1') and (abs(abs(x) - abs(y + 31) * 0.66) < 1.2 and abs(y + 31) < 22):
            return t['deep'] if level != 'deep' else INK     # the pressed X on its sides
        return None
    can = Skin(t['lit'], t['shade'], t['deep'], tex=tex)
    handles = merge([tube([(x, -62, 0), (x, -72, 0), (x + 8 * (1 if x > 0 else -1), -72, 0)], lambda u, a: 2.4, n=8)
                     for x in (-12.0, 0.0, 12.0)])
    spout = tube([(-17, -62, 0), (-19, -69, 0)], lambda u, a: 4.2, n=10)
    return [(body, can), (handles, Skin(t['lit'], t['shade'], t['deep'])), (spout, Skin(hx('#2a2a30'), hx('#16161c')))]
