"""The comic kit: a canvas of flat cut shapes, the poster's inks, a few geometry helpers, the game's lettering and the
panel registry. See tools/comic/STYLE.md for the art direction (NEON POSTER) and tools/generate_comic.py for the
entry point. Everything is a flat polygon or a disc, aliased, at SC panel px per title px. Deterministic: no
randomness at all (bead() gives the same scatter every run)."""
import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, 'assets', 'sprites', 'comic')
FONT = os.path.join(ROOT, 'assets', 'font', 'joystix.ttf')
SC = 3                         # panel px per title px


def hx(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


# ---------------------------------------------------------------- the inks
INK = hx('#0a070c')                                    # black
NIGHT, NIGHT_L, NIGHT_LL = hx('#170b2b'), hx('#2a1548'), hx('#3d2a6a')    # the violet night: ground, lifted, lit
BONE, BONE_D = hx('#f2e8d2'), hx('#b8a890')
PINK, PINK_D = hx('#ff3a7a'), hx('#8a1d5c')            # the bar's neon, a lamp
CYAN, CYAN_D = hx('#3ad8e8'), hx('#17566e')            # a tube, a torch
FIRE, FIRE_D = hx('#ff8a20'), hx('#c8381a')            # the match, the fire (page 3 on)
FLUO = hx('#e6ff1a')                                   # fluorescent yellow: CUEBALL's shades, nothing else
BLOOD = hx('#a0141e')


# ---------------------------------------------------------------- geometry
def bead(i):
    """A number in [0, 1) for the i-th thing scattered somewhere: the same every run."""
    s = math.sin(i * 127.1 + 311.7) * 43758.5453
    return s - math.floor(s)


def turned(pts, cx=0.0, cy=0.0, deg=0.0, s=1.0, f=1):
    """Points scaled by s (f -1: mirrored in x), turned deg about the origin, moved to (cx, cy)."""
    c, sn = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return [(cx + (x * f * c - y * sn) * s, cy + (x * f * sn + y * c) * s) for x, y in pts]


def slab(x0, y0, x1, y1, seed=0, k=3.0):
    """A rectangle cut by hand: its four corners each a little off (k px at most), the same every run."""
    return [(x + (bead(seed + i * 2) - 0.5) * 2 * k, y + (bead(seed + i * 2 + 1) - 0.5) * 2 * k)
            for i, (x, y) in enumerate(((x0, y0), (x1, y0), (x1, y1), (x0, y1)))]


def star(cx, cy, r0, r1, n, seed=0, turn=0.0, squash=1.0):
    """A burst: n points, r0 long, r1 between them, their lengths uneven."""
    out = []
    for k in range(n * 2):
        a = math.radians(k * 180 / n + turn)
        r = r0 * (0.7 + 0.6 * bead(seed + k)) if k % 2 == 0 else r1
        out.append((cx + math.cos(a) * r, cy + math.sin(a) * r * squash))
    return out


# ---------------------------------------------------------------- the canvas
class Cv:
    """A panel being cut: flat shapes pasted one over the other. bg None: a transparent sheet (an overlay)."""

    def __init__(self, w, h, bg=NIGHT):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0)) if bg is None else Image.new('RGB', (w, h), bg)

    def blank(self):
        return Image.new('L', (self.w, self.h), 0)

    def mask(self, pts):
        """A polygon (or a mask already) as a mask."""
        if isinstance(pts, Image.Image):
            return pts
        m = self.blank()
        if len(pts) >= 3:
            ImageDraw.Draw(m).polygon([(p[0], p[1]) for p in pts], fill=255)
        return m

    def paste(self, col, m, clip=None, cut=None):
        """Lay an ink through a mask; clip: only inside that shape; cut: not inside that one. Returns the mask."""
        if clip is not None:
            m = ImageChops.multiply(m, self.mask(clip))
        if cut is not None:
            m = ImageChops.subtract(m, self.mask(cut))
        self.im.paste(col if self.im.mode == 'RGB' else col + (255,), (0, 0), m)
        return m

    def poly(self, pts, col, clip=None, cut=None):
        return self.paste(col, self.mask(pts), clip, cut)

    def disc(self, cx, cy, rx, ry=None, col=BONE, clip=None, cut=None):
        ry = rx if ry is None else ry
        m = self.blank()
        ImageDraw.Draw(m).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
        return self.paste(col, m, clip, cut)

    def bar(self, a, b, w0, col, w1=None, clip=None, cut=None):
        """A straight strip from a to b, w0 wide at a and w1 at b (a wedge when they differ)."""
        w1 = w0 if w1 is None else w1
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / d / 2, dx / d / 2
        return self.poly([(a[0] + nx * w0, a[1] + ny * w0), (b[0] + nx * w1, b[1] + ny * w1), (b[0] - nx * w1, b[1] - ny * w1),
                          (a[0] - nx * w0, a[1] - ny * w0)], col, clip, cut)

    def path(self, pts, w, col, clip=None):
        """A strip along several points (a strap, a cable): bars end to end."""
        for a, b in zip(pts, pts[1:]):
            self.bar(a, b, w, col, clip=clip)
            self.disc(b[0], b[1], w / 2, col=col, clip=clip)

    def save(self, name, size):
        assert self.im.size == size, (name, self.im.size, size)
        os.makedirs(OUT_DIR, exist_ok=True)
        self.im.save(os.path.join(OUT_DIR, name + '.png'))


# ---------------------------------------------------------------- lettering
def text_mask(s, px):
    """A line of the game's font as an aliased mask, cropped to its ink."""
    f = ImageFont.truetype(FONT, px)
    m = Image.new('L', (int(f.getlength(s)) + px, px * 2), 0)
    d = ImageDraw.Draw(m)
    d.fontmode = '1'
    d.text((2, 2), s, font=f, fill=255)
    return m.crop(m.getbbox())


SEGMENTS = {'0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc',
            '8': 'abcdefg', '9': 'abcdfg'}


def digits(cv, x, y, s, h, col):
    """A clock's digits, seven segments each, h tall, from (x, y) their top left; ':' is two dots."""
    w, th = h * 0.5, max(3, round(h * 0.16))
    for ch in s:
        if ch == ':':
            for yy in (h * 0.28, h * 0.68):
                cv.poly([(x, y + yy), (x + th, y + yy), (x + th, y + yy + th), (x, y + yy + th)], col)
            x += th * 3
            continue
        seg = {'a': (x, y, x + w, y + th), 'g': (x, y + (h - th) / 2, x + w, y + (h + th) / 2), 'd': (x, y + h - th, x + w, y + h),
               'f': (x, y, x + th, y + h / 2), 'e': (x, y + h / 2, x + th, y + h), 'b': (x + w - th, y, x + w, y + h / 2),
               'c': (x + w - th, y + h / 2, x + w, y + h)}
        for k in SEGMENTS[ch]:
            x0, y0, x1, y1 = seg[k]
            cv.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], col)
        x += w + th * 2


# ---------------------------------------------------------------- the panels
# name -> (painter, its size in panel px): SC x the panel's size in the title's px (Cinematic.js, Leap.js, Ending.js).
# Filled by the modules of tools/comic/panels (one per page) through @panel.
PANELS = {}


def panel(name, size):
    """Register a painter (no argument, returns a Cv of that size) as the still `name`."""
    def reg(paint):
        PANELS[name] = (paint, size)
        return paint
    return reg
