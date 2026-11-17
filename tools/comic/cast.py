"""The comic's cast: the hero, the boss's three men (the heavy, the slick one, the young one) and the boss, each a
posable 3D figure (tools/comic/anatomy.py builds the meshes, tools/comic/solid.py renders them flat with their ink).

    light = Light(key=FIRE_L, fill=hx('#4a3a7a'))                  # the colours of this panel's light
    sc = Scene(w, h, light=(0.3, 0.7, 0.65), rims=[...], scale=s)  # its direction, its back lights
    fig = Figure(SLICK, pose=dict(chest=ypr(0, 10, 0), wrist_l=(...)),
                 hands=dict(l=dict(shape=flat(), fwd=(...), palm=(...))), face=dict(smile=(0, 0.7), gaze=(-1, 2)))
    place = Xf(ox, oy, s, ypr(-35))                                 # body space -> panel px
    fig.add(sc, place, light)
    sc.add(prop_mesh, prop_skin, fig.hand_xf('l', place))           # a prop in his left hand's own space
    sc.render(cv)

Body space: he stands at the origin facing +z, the floor at y 0, up is -y, 7.5 heads tall (a head is 100); his
right ('r') is on -x. A hand's own space: the wrist at the origin, the fingers along +y, the palm facing +z (a right
hand's thumb on -x, a left hand's on +x). Read tools/comic/STYLE.md first.
"""
import math

from .anatomy import (RELAXED, Body, Build, Curve, Hand, Head, bell, hair_off, mirrored, phi_of, place_ring, section,
                      shoe, smooth, tone3)
from .kit import INK, hx
from .solid import Skin, Xf, add, box, frame, grid, lerp, mm, sub, tube, unit


def mix(a, b, k):
    return tuple(int(round(a[i] + (b[i] - a[i]) * k)) for i in range(3))


# ---------------------------------------------------------------- the light's colours
class Light:
    """The colours of a panel's light: key (what the light is), fill (what the shadows are bathed in), gain (how hard
    the key burns), deep (how near the ink the deepest shadow goes). tones(base) turns a thing's own colour into its
    flat tones under that light; skin(base) makes the Skin."""

    def __init__(self, key=(255, 244, 228), fill=(96, 84, 150), gain=1.1, deep=0.55):
        self.key, self.fill, self.gain, self.deep = key, fill, gain, deep

    def tones(self, base, shine=0.0):
        lit = tuple(min(255, int(b * k / 255 * self.gain + 4)) for b, k in zip(base, self.key))
        shade = tuple(int(b * f / 255 * 0.95) for b, f in zip(base, self.fill))
        return tone3(lit, shade, mix(shade, INK, self.deep), mix(lit, (255, 255, 255), shine) if shine else None)

    def skin(self, base, shine=0.0, tex=None, **kw):
        t = self.tones(base, shine)
        return Skin(t['lit'], t['shade'], t['deep'], hi=t['hi'] if shine else None, tex=tex, **kw)


def hand_parts(hand, light, colour, side='r'):
    """A Hand's meshes with their skins (colour: the skin's own; its nails painted on the last bones), mirrored for
    a left hand: [(mesh, skin)] in the hand's own space."""
    t = light.tones(colour)
    nails = tone3(mix(t['lit'], (255, 255, 255), 0.25), t['shade'], t['deep'])

    def tex(a, level, n):
        u, ang, tip = a
        if tip > 0.5 and 0.32 < u < 0.92 and (ang < 52 or ang > 308):
            return nails[level]
        return None
    palm, fingers = light.skin(colour), light.skin(colour, tex=tex)
    return [(mirrored(m) if side == 'l' else m, palm if part == 'palm' else fingers) for m, part in hand.meshes()]


# ---------------------------------------------------------------- the characters
# Their own colours (under a white light): the panel's Light makes their tones.
HERO = dict(
    name='hero', build=Build(width=1.0, depth=0.98, shoulder=74),
    head=dict(chin=0.8, jaw=0.06, brow=0.4, cheek=-0.25, nose=1.0, neck=17.5),
    hair='hero', beard=True, outfit='coat', cap=True, scarf=True, satchel=True,
    colours=dict(skin=hx('#c48a62'), lip=hx('#b0745c'), stubble=hx('#a87458'), hair=hx('#4a2e1e'),
                 brow=hx('#2e1c14'), iris=hx('#3a2216'), white=hx('#e0d6c4'), coat=hx('#3a3a42'),
                 lining=hx('#1e4650'), knit=hx('#8a8a88'), trousers=hx('#3a4a66'), shoes=hx('#2e2018'),
                 leather=hx('#6a3e22'), cap=hx('#26262c'), scarf=hx('#56565c'), button=hx('#1e4650')))
HEAVY = dict(
    name='heavy', build=Build(width=1.16, depth=1.12, belly=8, chest=4, hips=1.08, shoulder=84, limb=1.2),
    head=dict(width=1.05, jaw=0.18, brow=1.1, nose=1.05, hook=0.6, chin=0.6, neck=24.0, eye=0.85, skull=0.97),
    hair='shaved', outfit='leather', chain=True,
    colours=dict(skin=hx('#d8a48c'), lip=hx('#c08470'), scalp=hx('#c09078'), brow=hx('#3a2a22'),
                 iris=hx('#3a3a30'), white=hx('#e0d6c4'), jacket=hx('#1c1a1e'), shirt=hx('#2a2a30'),
                 trousers=hx('#24242c'), shoes=hx('#161214'), chain=hx('#d8b048')))
SLICK = dict(
    name='slick', build=Build(width=0.94, depth=0.94, shoulder=71, hips=0.95, limb=0.92),
    head=dict(width=0.95, jaw=-0.02, cheek=-0.9, nose=1.15, hook=1.0, chin=0.7, brow=0.5, neck=16.5),
    hair='slick', moustache=True, outfit='suit', overcoat=True, ring=True, square=True,
    colours=dict(skin=hx('#c49674'), lip=hx('#a8705c'), hair=hx('#141016'), brow=hx('#141016'), iris=hx('#241612'),
                 white=hx('#e0d6c4'), jacket=hx('#26222e'), shirt=hx('#e8e2d6'), coat=hx('#1a1820'),
                 trousers=hx('#26222e'), shoes=hx('#120e10'), ring=hx('#e0b040'), square=hx('#b02a3a')))
YOUNG = dict(
    name='young', build=Build(width=1.04, depth=0.96, shoulder=78, hips=0.94),
    head=dict(jaw=0.12, chin=0.4, brow=0.7, nose=1.0, hook=0.35, cheek=-0.2, neck=18.5),
    hair='ponytail', beard=True, scar=True, outfit='bomber',
    colours=dict(skin=hx('#dcaa90'), lip=hx('#c08470'), stubble=hx('#b48a74'), hair=hx('#1e1612'), brow=hx('#1e1612'),
                 iris=hx('#2a3a3a'), white=hx('#e0d6c4'), jacket=hx('#5a1e26'), rib=hx('#2a1418'), shirt=hx('#d8d4cc'),
                 trousers=hx('#34405a'), shoes=hx('#d0ccc4'), band=hx('#1e4650'), scar=hx('#f0c4b4')))
BOSS = dict(
    name='boss', build=Build(width=1.1, depth=1.18, belly=16, hips=1.1, shoulder=78),
    head=dict(width=1.07, jowl=1.0, jaw=0.1, nose=1.3, tip=1.0, brow=0.7, chin=0.2, neck=23.0),
    hair='boss', outfit='suit', ring=True, square=True,
    colours=dict(skin=hx('#cc8c7c'), lip=hx('#b07466'), hair=hx('#b0acb0'), brow=hx('#8a8488'), iris=hx('#2a2a26'),
                 white=hx('#ddd2c0'), jacket=hx('#d8ccb0'), shirt=hx('#3a2a2e'), trousers=hx('#d0c4a8'),
                 shoes=hx('#3a2418'), ring=hx('#e0b040'), square=hx('#7a1a2a')))

# where the hair stops (height y at phi degrees round from the front to the back) and how thick it is (phi, y)
HAIRLINES = {
    'hero': ([(0, 22), (25, 23), (45, 27), (66, 34), (78, 58), (88, 60), (96, 44), (122, 44), (150, 78), (180, 82)],
             lambda phi, y: 5.0 + 2.0 * smooth(40, 0, y)),
    'slick': ([(0, 17), (30, 20), (55, 27), (72, 38), (80, 57), (86, 57), (93, 42), (125, 42), (150, 70), (180, 72)],
              lambda phi, y: 2.4 + 0.8 * smooth(30, 0, y)),
    'ponytail': ([(0, 22.5), (8, 19), (30, 20), (55, 27), (72, 38), (80, 52), (86, 52), (93, 42), (125, 42), (150, 70),
                  (180, 72)], lambda phi, y: 2.8 + 0.8 * smooth(30, 0, y)),
    'boss': ([(0, 16), (18, 18), (32, 27), (50, 24), (70, 36), (80, 50), (86, 50), (93, 42), (125, 44), (150, 70),
              (180, 72)], lambda phi, y: 2.6),
    'shaved': ([(0, 25), (30, 26), (55, 30), (72, 40), (80, 52), (86, 52), (93, 44), (125, 46), (150, 72), (180, 74)],
               None),
}
HEMS = {'leather': -392, 'bomber': -398, 'knit': -386}   # where a short top stops and the trousers show


# ---------------------------------------------------------------- the figure
class Figure:
    """A character (HERO, HEAVY, ...) posed. pose: Body's keys; hands: {'r' / 'l': dict(shape (RELAXED, FIST,
    grip(r), flat(), ...), fwd (where the fingers point, body space), palm (where the palm looks))}, hanging relaxed by
    default; face: the head's expression (smile=(right, left), gaze=(x, y), lids, squint, brow_lift=(right, left));
    bare: no coat, cap, scarf or satchel (the hero at home, in his knit); t_face: how squarely the face must take the
    light to be lit (higher: harder, more of it in shadow); hand_shadows False: his hands throw no shadow (on his
    own face from a lamp below them, say); head_light: a key light of the head's own (Skin.light)."""

    def __init__(self, who, pose=None, hands=None, face=None, bare=False, t_face=0.1, hand_shadows=True,
                 head_light=None):
        self.who, self.bare, self.t_face, self.hand_shadows = who, bare, t_face, hand_shadows
        self.head_light = head_light
        self.C = who['colours']
        self.outfit = 'knit' if bare else who['outfit']
        self.body = Body(who['build'], pose or {})
        self.hands = {'r': dict(shape=RELAXED), 'l': dict(shape=RELAXED)}
        for s, h in (hands or {}).items():
            self.hands[s] = dict(self.hands[s], **h)
        mods = dict(who['head'])
        mods.update(face or {})
        self.brow_lift = mods.pop('brow_lift', (0.0, 0.0))
        self.head = Head(**mods)

    def has(self, what):
        return bool(self.who.get(what)) and not self.bare

    # -------------------------------------------------------------- placements
    def hand_frame(self, s):
        h, b = self.hands[s], self.body
        fwd = h.get('fwd') or unit(sub(b.wrist[s], b.elbow[s]))
        palm = h.get('palm') or ((1, 0, 0.2) if s == 'r' else (-1, 0, 0.2))
        return frame(fwd, palm)

    def hand_xf(self, s, xf):
        """His hand s's own space placed under the figure's placement xf: for what he holds."""
        return Xf.raw(mm(xf.m, self.hand_frame(s)), xf(self.body.wrist[s]))

    # -------------------------------------------------------------- the whole man
    def add(self, sc, xf, light):
        """Add him to the scene sc, placed by xf (body space -> panel px), in the colours of light."""
        b, C = self.body, self.C
        t = {k: light.tones(v) for k, v in C.items()}
        lk = self.who['build'].limb
        # the legs in their trousers, the shoes
        trousers = light.skin(C['trousers'])
        shiny = self.who['name'] in ('slick', 'boss')
        shoes = light.skin(C['shoes'], shine=0.3 if shiny else 0.0, tex=self.shoe_tex(t))
        for s in ('r', 'l'):
            sc.add(b.limb(b.hip[s], b.knee[s], b.ankle[s], 30 * lk, 20 * lk, 16.5, (0, 0, 1), bulge=(2 * lk, 1.5), n=18),
                   trousers, xf)
            sc.add(shoe(b.ankle[s], b.toe[s], height=30 if self.outfit in ('coat', 'leather') else 26), shoes, xf)
        # the torso and, for a long coat, its skirt
        sc.add(b.torso(), self.top_skin(light, t), xf)
        if self.outfit == 'coat' or self.who.get('overcoat'):
            sc.add(self.skirt(), light.skin(C['coat'], tex=lambda a, level, n: INK if (a[2] > 0 and abs(a[0]) < 3)
                                            else None), xf)
        # the arms in their sleeves, the hands
        sleeve = self.sleeve_skin(light, t)
        for s in ('r', 'l'):
            hf = self.hand_frame(s)
            palm_dir = (hf[0][2], hf[1][2], hf[2][2])
            cuff = lerp(b.wrist[s], b.elbow[s], 0.1)          # the sleeve stops short of the wrist
            sc.add(b.limb(b.shoulder[s], b.elbow[s], cuff, 19 * lk, 16 * lk, 14.0, palm_dir, bulge=(1.5 * lk, 2.0 * lk),
                          n=16, squash=lambda u: 1.0 + 0.2 * smooth(0.6, 1.0, u)), sleeve, xf)
            if self.outfit == 'suit' or self.who.get('overcoat'):
                sc.add(tube([lerp(b.wrist[s], b.elbow[s], 0.13), lerp(b.wrist[s], b.elbow[s], 0.03)],
                            lambda u, a: 12.0, n=12, up=palm_dir, squash=lambda u: 1.15), light.skin(C['shirt']), xf)
            else:
                sc.add(tube([cuff, lerp(b.wrist[s], b.elbow[s], -0.02)], lambda u, a: 10.0 - 1.5 * u, n=12, up=palm_dir,
                            squash=lambda u: 1.2), light.skin(C['skin']), xf)
            hand = Hand(self.hands[s]['shape'])
            hx_ = self.hand_xf(s, xf)
            for m, skin in hand_parts(hand, light, C['skin'], s):
                sc.add(m, skin, hx_, cast=self.hand_shadows)
            if self.who.get('ring') and s == 'l':
                a_, b_ = hand.bones[9][0], hand.bones[9][1]           # a gold ring on his little finger
                ring = tube([lerp(a_, b_, 0.35), lerp(a_, b_, 0.62)], lambda u, ang: 4.4, n=10)
                sc.add(mirrored(ring), light.skin(C['ring'], shine=0.6), hx_)
        # the neck, the head, its ears and hair, what stands round the neck, the cap
        hxf = b.head_xf(xf)
        hd = self.head
        hl = self.head_light
        sc.add(hd.mesh(), light.skin(C['skin'], tex=hd.face(self.face_pal(t), self.face_extra(t)), t_lit=self.t_face,
                                     light=hl), hxf)
        sc.add(hd.neck(), light.skin(C['skin'], t_lit=self.t_face, light=hl), hxf)
        st = t['skin']
        ear = light.skin(C['skin'], light=hl, tex=lambda a, level, n: (st['shade'] if level in ('lit', 'hi') else
                                                                       st['deep'])
                         if (0.36 < a[0] < 0.76 and 62 < a[1] < 118) else None)
        for side in (-1, 1):
            sc.add(hd.ear(side), ear, hxf)
        self.add_hair(sc, hxf, light, t)
        self.add_collar(sc, xf, hxf, light, t)
        if self.has('cap'):
            self.add_cap(sc, hxf, light)
        if self.who.get('chain'):
            b_ = self.body
            pts = [b_.chest_pt((x, -630 + 0.0064 * x * x, 14 + 0.2 * (30 - abs(x)))) for x in range(-30, 31, 6)]
            sc.add(tube(pts, lambda u, a: 2.2, n=8, caps=(False, False)), light.skin(C['chain'], shine=0.6), xf)
        if self.has('satchel'):
            bag = light.skin(C['leather'], tex=lambda a, level, n: INK if (a[3] == 'x1' and abs(a[1] + 8) < 1.2) else None)
            sc.add(box(-9, -26, -24, 9, 24, 24), bag, Xf.raw(mm(xf.m, b.Rp), xf(b.pelvis_pt((64, -420, 8)))))

    # -------------------------------------------------------------- the coat's skirt
    def skirt(self):
        """A long coat's skirt, from the waist to below the knee, open down the front."""
        b = self.body
        rows, at, centers = [], [], []
        hem = -205.0
        ang = [8 + i * (344 / 40.0) for i in range(41)]
        R = b.Rp
        side, front = (R[0][0], R[1][0], R[2][0]), (R[0][2], R[1][2], R[2][2])
        for y in (-470.0, -430.0, -395.0, -340.0, -280.0, hem):
            k = (y + 470) / (hem + 470)
            W, zf, zb = b.b.ring(y, 60 + 16 * k, 37 - 2 * k, -41 - 6 * k)
            c = b.pelvis_pt((0, y, 0))
            sec = section(W, zf + 3, zb, 0.8, ang)
            rows.append(place_ring(c, side, front, sec))
            at.append([(x, y, z) for x, z in sec])
            centers.append(c)
        return grid(rows, at, centers)

    # -------------------------------------------------------------- the face
    def face_pal(self, t):
        return dict(skin=t['skin'], lip=t.get('lip', t['skin']), white=t['white'], iris=t['iris'], brow=t['brow'],
                    brow_lift=self.brow_lift)

    def face_extra(self, t):
        """What a character has on his face beyond its features: stubble, a moustache, a scar, a shaved scalp."""
        who, hd = self.who, self.head
        line = Curve(HAIRLINES[who['hair']][0])
        shaved = who['hair'] == 'shaved'

        def extra(x, y, z, level):
            ax = abs(x)
            if shaved and y < line(phi_of((x, y, z))) - 0.5:
                return t['scalp'][level]
            if who.get('moustache') and 71.6 < y < 73.4 - 0.12 * ax and ax < 9.6 and z > 20:
                return t['hair'][level]
            if who.get('scar') and x > 0 and z > 10 and 33 < y < 72 and not 40 < y < 52:
                if abs((x - 9.0) - (y - 34.0) * 0.17) < 0.9 and level != 'deep':
                    return t['scar'][level]         # pale, through his right brow and down the cheek
            if who.get('beard') and z > -6:
                # three days of beard on the jaw, the chin and the upper lip, not on the lips
                my = hd.mouth_y(x)
                lips = ax < 10 and my - 3.0 < y < my + 3.4
                low = y > 64 + 6 * bell(ax / 22) + (8 if ax > 22 else 0)
                if low and not lips and y > 70.5 - 0.15 * ax:
                    return t['stubble'][level]
            return None
        return extra

    # -------------------------------------------------------------- the clothes
    def top_skin(self, light, t):
        """The torso: the long coat open on the knit (the satchel's strap across), the leather jacket, the suit (an
        overcoat over it), the bomber, the knit."""
        who, C, outfit = self.who, self.C, self.outfit
        if who.get('overcoat') and not self.bare:
            outfit = 'overcoat'
        hem = HEMS.get(outfit)

        def suit(x, y, z, level, front=None):
            ax = abs(x)
            v = 3 + max(0.0, -465 - y) * 0.075         # the jacket's V down to its button
            if z <= 0 or y > -465:
                return None
            if ax < v:
                if ax < 1.0 and y > -600:
                    return t['shirt']['shade'] if level != 'deep' else t['shirt']['deep']   # the shirt's placket
                return t['shirt'][level]
            if ax < v + 1.3:
                return INK
            if y < -520 and ax < v + 10 + max(0.0, -560 - y) * 0.12:
                return t['jacket']['shade'] if level in ('lit', 'hi') else None             # the lapel, turned over
            if y < -520 and ax < v + 11.2 + max(0.0, -560 - y) * 0.12:
                return INK
            if abs(y + 465) < 3 and ax < 3:
                return INK                                                                  # the button
            if who.get('square') and 28 < x < 42 and -572 < y < -561:
                return t['square'][level] if y > -571 or abs(x - 35) < 5 else INK            # a square in his pocket
            return None

        def tex(a, level, n):
            x, y, z = a
            ax = abs(x)
            if hem is not None and y > hem:
                return t['trousers'][level]
            if outfit == 'knit':
                if y < -632 or y > hem - 9:
                    return t['knit']['shade'] if level in ('lit', 'hi') else t['knit']['deep']   # its ribbed neck, hem
                return None
            if outfit == 'coat':
                sx = -46 + (y + 610) * -0.62           # the satchel's strap, his right shoulder to his left hip
                if abs(x - sx) < 7 and z > -30 and y < -420:
                    return t['leather'][level] if abs(x - sx) < 5.6 else INK
                gap = 9 + (y + 640) * -0.04 if y < -470 else 3
                if z > 0 and ax < gap:
                    return t['knit'][level]
                if z > 0 and ax < gap + 1.4:
                    return INK
                return None
            if outfit == 'suit':
                return suit(x, y, z, level)
            if outfit == 'overcoat':
                front = 20 + (y + 640) * -0.06         # the coat worn open on the suit
                if z > 0 and ax < front and y < -440:
                    return suit(x, y, z, level) or t['jacket'][level]
                if z > 0 and ax < front + 1.6 and y < -440:
                    return INK
                return None
            if outfit == 'leather':
                if z > 0 and ax < 1.1 and y > -600:
                    return INK                                                     # the zip
                if z > 0 and y < -600 and ax < 14 - (y + 640) * 0.1:
                    return t['shirt'][level]
                if y > hem - 10:
                    return t['jacket']['shade'] if level in ('lit', 'hi') else None   # the band at its hem
                return None
            if outfit == 'bomber':
                if y > hem - 10 or y < -628:
                    return t['rib'][level]                                         # ribbed collar and hem
                if z > 0 and ax < 1.1 and y > -596:
                    return INK                                                     # the zip
                if z > 0 and y < -614 and ax < 10 - (y + 640) * 0.25:
                    return t['shirt'][level]                                       # his T-shirt's neck
                return None
            return None
        base = {'knit': 'knit', 'coat': 'coat', 'overcoat': 'coat'}.get(outfit, 'jacket')
        return light.skin(C[base], shine=0.15 if outfit == 'leather' else 0.0, tex=tex)

    def sleeve_skin(self, light, t):
        C, outfit = self.C, self.outfit
        base = C['coat'] if (outfit == 'coat' or self.who.get('overcoat')) and not self.bare else \
            C['knit'] if outfit == 'knit' else C['jacket']
        cuff = t['rib'] if outfit == 'bomber' else None

        def tex(a, level, n):
            u, ang, ue = a
            if cuff and u > 0.93:
                return cuff[level]
            if abs(u - ue) < 0.05 and (ang < 40 or ang > 320):    # creases inside the elbow
                k = abs(u - ue) / 0.05
                if (k < 0.2 or abs(k - 0.7) < 0.12) and level != 'lit':
                    return INK
            return None
        return light.skin(base, shine=0.15 if outfit == 'leather' else 0.0, tex=tex)

    def shoe_tex(self, t):
        sole = t['shoes']

        def tex(a, level, n):
            ang = a[1]
            if 150 < ang < 210:
                return INK
            if 110 < ang < 250:
                return sole['deep']
            return None
        return tex

    # -------------------------------------------------------------- hair, collars, cap
    def add_hair(self, sc, hxf, light, t):
        who, hd = self.who, self.head
        style = who['hair']
        knots, thick = HAIRLINES[style]
        if thick is None:
            return
        line = Curve(knots)
        hair = t['hair']
        shine = mix(hair['lit'], (255, 255, 255), 0.22)

        def tex(a, level, n):
            x, y, z = a
            # the comb's tracks run front to back: lines round the axis through the ears
            th = math.degrees(math.atan2(x, 52.0 - y))
            if style in ('slick', 'ponytail', 'boss') and level in ('lit', 'hi') and (th + 2.0 * math.sin(th * 0.7)) % 9.0 < 0.9:
                return shine
            return None
        skin = light.skin(who['colours']['hair'], tex=tex, light=self.head_light)
        off = hair_off(line, thick)
        if self.has('cap'):        # under the cap only what shows below its band
            band = Curve([(0, 31), (40, 33), (80, 40), (120, 44), (180, 46)])
            off0 = off
            off = lambda p, phi: off0(p, phi) if p[1] > band(phi) - 4 else -1.5
        sc.add(hd.shell(off, y_max=84), skin, hxf)
        if style == 'ponytail':
            path = [(0, 44, -44), (0, 58, -50), (0, 76, -53), (0, 92, -50)]
            sc.add(tube(path, lambda u, a: 6.5 * (1 - 0.5 * u) + 2.5 * bell((u - 0.25) / 0.3), n=12, up=(1, 0, 0)),
                   skin, hxf)
            sc.add(tube([(0, 45, -46.5), (0, 50, -48.5)], lambda u, a: 7.8, n=12), light.skin(self.C['band']), hxf)
        if style == 'hero':
            # down to his collar at the back: a fall of hair over the nape
            rows, centers = [], []
            ang = [96 + i * 12 for i in range(15)]
            for y in (60.0, 72.0, 84.0, 96.0, 108.0, 116.0):
                row = []
                k = smooth(70, 116, y)
                for a in ang:
                    p = hd.point(min(y, 70.0), a)
                    r = math.hypot(p[0], p[2] + 8) + 4.5 - 6 * k
                    row.append((math.sin(math.radians(a)) * r * (1 - 0.25 * k), y,
                                -8 + math.cos(math.radians(a)) * r * (1 - 0.1 * k)))
                rows.append(row)
                centers.append((0, y, -8))
            sc.add(grid(rows, rows, centers), skin, hxf)

    def add_collar(self, sc, xf, hxf, light, t):
        """What stands round his neck: the coat's collar turned up (its petrol lining), the scarf over his mouth, a
        shirt's collar."""
        C, b, hd = self.C, self.body, self.head
        if self.outfit == 'coat':
            lining = t['lining']
            rows, at, centers = [], [], []
            for k, (y, r) in enumerate(((-626, 36), (-650, 31), (-678, 29), (-700, 30))):
                c = b.chest_pt((0, y, -10))
                row, ar = [], []
                for i in range(15):
                    a = 40 + i * (280 / 14.0)
                    s_, c_ = math.sin(math.radians(a)), math.cos(math.radians(a))
                    row.append(add(c, (s_ * r, 0, c_ * r * 0.95)))
                    ar.append((k / 3.0, a, 0.0))
                rows.append(row)
                at.append(ar)
                centers.append(c)
            sc.add(grid(rows, at, centers), light.skin(C['coat'], tex=lambda a, level, n: lining[level]
                                                       if a[0] > 0.86 else None), xf)
        if self.has('scarf'):
            # wound round his neck and pulled up over his mouth, to the nose
            rn = hd.m['neck'] + 7
            rows, centers = [], []
            ang = [i * 10.0 for i in range(37)]
            for y in (70.5, 75.0, 80.0, 86.0, 92.0, 98.0, 104.0, 112.0, 122.0):
                row = []
                for a in ang:
                    s_, c_ = math.sin(math.radians(a)), math.cos(math.radians(a))
                    q = (s_ * rn, y, -8 + c_ * rn * 1.05)
                    if y <= 104:
                        p = hd.point(min(y, 95.0), a, 3.5 + 3.0 * bell((y - 70) / 7) * max(0.0, c_))
                        p = (p[0], y, p[2] - 2.0 * smooth(92, 104, y) * max(0.0, c_))
                        if math.hypot(p[0], p[2] + 8) > math.hypot(q[0], q[2] + 8):
                            q = p
                    row.append(q)
                rows.append(row)
                centers.append((0, y, -6))
            sd = t['scarf']
            knit = light.skin(C['scarf'], tex=lambda a, level, n: sd['deep'] if (
                (a[1] + 4 * math.sin(a[0] * 0.08)) % 11 < 1.4 and level != 'deep') else None)
            sc.add(grid(rows, rows, centers), knit, hxf)
        if self.outfit == 'suit' or self.who.get('overcoat'):
            shirt = light.skin(C['shirt'])
            for side in (-1, 1):
                p0, p1 = b.chest_pt((side * 8, -642, 17)), b.chest_pt((side * 21, -628, 15))
                sc.add(tube([p0, p1], lambda u, a: 5.5 - 2 * u, n=8, up=(0, 0, 1), squash=lambda u: 0.45), shirt, xf)

    def add_cap(self, sc, hxf, light):
        """His flat cap: a band round the head at the brow, its crown puffed out and flat on top, pulled forward over
        the peak; the peak low over his eyes; a button on top."""
        C, hd = self.C, self.head
        band = Curve([(0, 31), (40, 33), (80, 40), (120, 44), (180, 46)])
        ang = [i * 7.5 - 180 for i in range(49)]
        rows, centers = [], []
        for k in (0.0, 0.25, 0.5, 0.7, 0.85, 0.94, 1.0):
            row = []
            for a in ang:
                p = hd.point(band(abs(a)), a, 2.5)
                s_, c_ = math.sin(math.radians(a)), math.cos(math.radians(a))
                # the edge of the flat top: wider than the head, reaching forward over the peak
                top = (s_ * 37.0, 0.0, 6.0 + c_ * (50.0 if c_ > 0 else 42.0))
                top = (top[0], -5.0 + 0.26 * top[2], top[2])
                if k <= 0.7:
                    u = k / 0.7
                    q = lerp(p, top, u * u * (3 - 2 * u))
                    bulge = 5.0 * bell((u - 0.65) / 0.5)
                    q = (q[0] + s_ * bulge, q[1], q[2] + c_ * bulge)
                else:
                    u = (k - 0.7) / 0.3            # across the flat top to its middle
                    mid = (0.0, -5.0 + 0.26 * 4.0, 4.0)
                    q = lerp(top, mid, u)
                    q = (q[0], q[1] - 1.5 * math.sin(math.pi * u), q[2])
                row.append(q)
            rows.append(row)
            centers.append((0.0, 20.0 - k * 20, 0.0))
        cap = light.skin(C['cap'], tex=lambda a, level, n: INK if (abs(a[0]) < 0.8 and a[1] < 4 and a[2] > 10) else None)
        sc.add(grid(rows, rows, centers), cap, hxf)
        rows = []
        for j in range(5):
            k = j / 4
            row = []
            for i in range(13):
                a = -70 + i * (140 / 12)
                p = hd.point(30.0, a, 4.0)
                reach = 17.0 * k * math.cos(math.radians(a * 0.9)) ** 0.6
                row.append(add(p, (math.sin(math.radians(a)) * reach * 0.5, 4.0 * k * k + 1.0 * k,
                                   math.cos(math.radians(a)) * reach)))
            rows.append(row)
        top = grid(rows)
        under = grid([[add(p, (0, 1.8, 0)) for p in r] for r in rows])
        under.tris = [(i, k, j) for i, j, k in under.tris]
        sc.add(top, cap, hxf)
        sc.add(under, cap, hxf)
        sc.add(tube([(0, -3.0, 4), (0, -5.5, 4.5)], lambda u, a: 3.2, n=10), light.skin(C['button']), hxf)
