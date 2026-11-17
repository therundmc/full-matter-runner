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

from PIL import Image

from .anatomy import (FIST as FIST_, RELAXED, Body, Build, Curve, Hand, Head, bell, bend_of, fold_tex, hair_off, mirrored, phi_of,
                      place_ring, section, sleeve_folds, trouser_folds,
                      shoe, smooth, tone3)
from .kit import INK, hx
from .solid import Skin, Xf, add, box, frame, grid, lerp, mm, mv, sub, tube, unit


def mul_(v, k):
    return (v[0] * k, v[1] * k, v[2] * k)


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


def hand_parts(hand, light, colour, side='r', creases=True):
    """A Hand's meshes with their skins (colour: the skin's own; its nails painted on the last bones), mirrored for
    a left hand: [(mesh, skin)] in the hand's own space."""
    t = light.tones(colour)
    nails = tone3(mix(t['lit'], (255, 255, 255), 0.25), t['shade'], t['deep'])

    def tex(a, level, n):
        u, ang, tip, L = a
        back = ang < 55 or ang > 305
        if tip > 0.5 and 0.32 < u < 0.92 and back:
            return nails[level]
        if back and level != 'deep' and abs(u * L - 1.4) < 0.35 and (ang < 40 or ang > 320):
            return INK                                   # the wrinkle over a knuckle
        return None

    def back_tex(a, level, n):
        # the tendons on the back of the hand, fanning from the wrist to the knuckles
        if len(a) == 3 and a[2] < -3.0 and level == 'lit' and 18 < a[1] < 34:
            k = a[1] / 40.0
            for kx in (-11.5, -3.5, 4.5):
                if abs(a[0] - kx * (0.35 + 0.65 * k)) < 0.3 * (34 - a[1]) / 16:
                    return INK
        return None
    palm, fingers = light.skin(colour, tex=back_tex, creases=creases), light.skin(colour, tex=tex, creases=creases)
    return [(mirrored(m) if side == 'l' else m, palm if part == 'palm' else fingers) for m, part in hand.meshes()]


def wrist_for(fwd, palm, at, point=(0.0, 43.0, 0.0)):
    """Where a wrist must be for its hand (fingers along fwd, palm toward palm, body space) to put its own point
    `point` (the knuckle of the middle finger by default) at the body point `at`."""
    F = frame(fwd, palm)
    return sub(at, mv(F, point))


# a long coat's drape: folds falling from the hips to the hem, each a line that starts thin and opens out
DRAPES = [(-150, -440, 0.0), (-118, -400, 4.0), (-62, -430, -3.0), (-30, -360, 2.0), (34, -380, -2.0), (66, -420, 3.0),
          (112, -400, -4.0), (152, -440, 2.0)]


def drape_tex(a, level, n):
    """A coat skirt's tex: its front edge and the drape's folds, inked (attr: the standing point x, y, z)."""
    x, y, z = a
    if z > 0 and abs(x) < 2.2:
        return INK
    if level == 'deep':
        return None
    phi = math.degrees(math.atan2(x, z))
    for p0, top, wig in DRAPES:
        if y > top:
            k = (y - top) / 230.0
            if abs(phi - (p0 + wig * k * 3)) < 1.0 + 2.6 * k:
                return INK if k > 0.08 else None
    return None


# ---------------------------------------------------------------- the characters
# Their own colours (under a white light): the panel's Light makes their tones.
HERO = dict(
    name='hero', build=Build(width=1.0, depth=0.98, shoulder=74),
    head=dict(chin=0.9, jaw=0.12, brow=0.8, cheek=-0.35, nose=1.1, hook=0.3, neck=17.5,
              lines=('naso', 'jaw', 'cheek', 'bags', 'chin')),
    hair='hero', beard=True, outfit='coat', cap=True, scarf=True, satchel=True,
    colours=dict(skin=hx('#c48a62'), lip=hx('#b0745c'), stubble=hx('#a87458'), hair=hx('#4a2e1e'),
                 brow=hx('#2e1c14'), iris=hx('#3a2216'), white=hx('#e0d6c4'), coat=hx('#3a3a42'),
                 lining=hx('#1e4650'), knit=hx('#8a8a88'), trousers=hx('#3a4a66'), shoes=hx('#2e2018'),
                 leather=hx('#6a3e22'), cap=hx('#26262c'), scarf=hx('#56565c'), button=hx('#1e4650')))
HEAVY = dict(
    name='heavy', build=Build(width=1.16, depth=1.12, belly=8, chest=4, hips=1.08, shoulder=84, limb=1.2),
    head=dict(width=1.05, jaw=0.22, brow=1.3, nose=1.1, hook=0.6, chin=0.7, neck=24.0, eye=0.85, skull=0.97,
              lines=('naso', 'jaw', 'forehead', 'furrow', 'bags', 'crows')),
    hair='shaved', outfit='leather', chain=True,
    colours=dict(skin=hx('#d8a48c'), lip=hx('#c08470'), scalp=hx('#c09078'), brow=hx('#3a2a22'),
                 iris=hx('#3a3a30'), white=hx('#e0d6c4'), jacket=hx('#1c1a1e'), shirt=hx('#2a2a30'),
                 trousers=hx('#24242c'), shoes=hx('#161214'), chain=hx('#d8b048')))
SLICK = dict(
    name='slick', build=Build(width=0.94, depth=0.94, shoulder=71, hips=0.95, limb=0.92),
    head=dict(width=0.95, jaw=0.04, cheek=-0.9, nose=1.2, hook=1.0, chin=0.8, brow=0.7, neck=16.5,
              lines=('naso', 'cheek', 'jaw', 'crows', 'marionette')),
    hair='slick', moustache=True, beard=True, outfit='suit', overcoat=True, ring=True, square=True,
    colours=dict(skin=hx('#c49674'), lip=hx('#a8705c'), stubble=hx('#6a5a50'), hair=hx('#141016'), brow=hx('#141016'),
                 iris=hx('#241612'),
                 white=hx('#e0d6c4'), jacket=hx('#26222e'), shirt=hx('#e8e2d6'), coat=hx('#1a1820'),
                 trousers=hx('#26222e'), shoes=hx('#120e10'), ring=hx('#e0b040'), square=hx('#b02a3a')))
YOUNG = dict(
    name='young', build=Build(width=1.04, depth=0.96, shoulder=78, hips=0.94),
    head=dict(jaw=0.16, chin=0.5, brow=0.9, nose=1.05, hook=0.4, cheek=-0.3, neck=18.5,
              lines=('naso', 'jaw', 'cheek', 'chin')),
    hair='ponytail', beard=True, scar=True, outfit='bomber',
    colours=dict(skin=hx('#dcaa90'), lip=hx('#c08470'), stubble=hx('#b48a74'), hair=hx('#1e1612'), brow=hx('#1e1612'),
                 iris=hx('#2a3a3a'), white=hx('#e0d6c4'), jacket=hx('#5a1e26'), rib=hx('#2a1418'), shirt=hx('#d8d4cc'),
                 trousers=hx('#34405a'), shoes=hx('#d0ccc4'), band=hx('#1e4650'), scar=hx('#f0c4b4')))
BOSS = dict(
    name='boss', build=Build(width=1.1, depth=1.18, belly=16, hips=1.1, shoulder=78),
    head=dict(width=1.07, jowl=1.0, jaw=0.1, nose=1.3, tip=1.0, brow=0.9, chin=0.2, neck=23.0, heavy_lids=1.0,
              lids=0.7, lines=('naso', 'bags', 'forehead', 'crows', 'marionette', 'jaw', 'furrow')),
    hair='boss', outfit='suit', ring=True, square=True,
    colours=dict(skin=hx('#cc8c7c'), lip=hx('#b07466'), hair=hx('#b0acb0'), brow=hx('#8a8488'), iris=hx('#2a2a26'),
                 white=hx('#ddd2c0'), jacket=hx('#d8ccb0'), shirt=hx('#3a2a2e'), trousers=hx('#d0c4a8'),
                 shoes=hx('#3a2418'), ring=hx('#e0b040'), square=hx('#7a1a2a')))

# where the hair stops (height y at phi degrees round from the front to the back) and how thick it is (phi, y)
HAIRLINES = {
    'hero': ([(0, 22), (25, 23), (45, 27), (66, 34), (78, 58), (88, 60), (96, 44), (122, 44), (150, 78), (180, 82)],
             lambda phi, y: 5.0 + 2.0 * smooth(40, 0, y)),
    'slick': ([(0, 17), (30, 20), (55, 27), (72, 38), (80, 57), (86, 57), (93, 42), (125, 44), (150, 62), (180, 64)],
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
    own face from a lamp below them, say); head_light: a key light of the head's own (Skin.light); face_black: the
    face's own threshold for solid black (Skin.blacks), lower than the scene's to keep the eyes."""

    def __init__(self, who, pose=None, hands=None, face=None, bare=False, t_face=0.1, hand_shadows=True,
                 head_light=None, face_black=True, drawn_hands=True):
        self.who, self.bare, self.t_face, self.hand_shadows = who, bare, t_face, hand_shadows
        self.drawn_hands = drawn_hands
        self.head_light, self.face_black = head_light, face_black
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
        px = 1.0 / max(1e-3, xf.scale())                 # a panel px in model units: lines no thinner than that
        small = xf.scale() < 0.6
        t = {k: light.tones(v) for k, v in C.items()}
        lk = self.who['build'].limb
        # the legs in their trousers, the shoes
        shiny = self.who['name'] in ('slick', 'boss')
        shoes = light.skin(C['shoes'], shine=0.3 if shiny else 0.0, tex=self.shoe_tex(t))
        for s in ('r', 'l'):
            l1 = math.dist(b.hip[s], b.knee[s])
            folds = trouser_folds(l1 / (l1 + math.dist(b.knee[s], b.ankle[s])), bend_of(b.hip[s], b.knee[s], b.ankle[s]))
            sc.add(b.limb(b.hip[s], b.knee[s], b.ankle[s], 30 * lk, 20 * lk, 17.5, (0, 0, -1), bulge=(2 * lk, 1.5), n=18,
                          folds=folds), light.skin(C['trousers'], tex=fold_tex(folds, least=2.0 * px)), xf)
            sc.add(shoe(b.ankle[s], b.toe[s], height=30 if self.outfit in ('coat', 'leather') else 26), shoes, xf)
        # the torso and, for a long coat, its skirt
        sc.add(b.torso(), self.top_skin(light, t), xf)
        if self.outfit == 'coat' or self.who.get('overcoat'):
            sc.add(self.skirt(), light.skin(C['coat'], tex=drape_tex), xf)
        # the arms in their sleeves, the hands
        for s in ('r', 'l'):
            hf = self.hand_frame(s)
            palm_dir = (hf[0][2], hf[1][2], hf[2][2])
            cuff = lerp(b.wrist[s], b.elbow[s], 0.1)          # the sleeve stops short of the wrist
            l1 = math.dist(b.shoulder[s], b.elbow[s])
            folds = sleeve_folds(l1 / (l1 + math.dist(b.elbow[s], cuff)), bend_of(b.shoulder[s], b.elbow[s], cuff))
            sc.add(b.limb(b.shoulder[s], b.elbow[s], cuff, 19 * lk, 16.5 * lk, 15.0, palm_dir, bulge=(1.5 * lk, 2.0 * lk),
                          n=16, squash=lambda u: 1.0 + 0.2 * smooth(0.6, 1.0, u), folds=folds),
                   self.sleeve_skin(light, t, folds, 2.0 * px), xf)
            if self.outfit == 'suit' or self.who.get('overcoat'):
                sc.add(tube([lerp(b.wrist[s], b.elbow[s], 0.13), lerp(b.wrist[s], b.elbow[s], 0.03)],
                            lambda u, a: 12.0, n=12, up=palm_dir, squash=lambda u: 1.15), light.skin(C['shirt']), xf)
            else:
                sc.add(tube([cuff, lerp(b.wrist[s], b.elbow[s], -0.02)], lambda u, a: 10.0 - 1.5 * u, n=12, up=palm_dir,
                            squash=lambda u: 1.2), light.skin(C['skin']), xf)
            if self.drawn_hands:
                continue                  # drawn in ink after the render: draw_hands
            hand = Hand(self.hands[s]['shape'])
            hx_ = self.hand_xf(s, xf)
            for m, skin in hand_parts(hand, light, C['skin'], s, creases=not small):
                sc.add(m, skin, hx_, cast=self.hand_shadows)
            if self.who.get('ring') and s == 'l':
                a_, b_ = hand.bones[9][0], hand.bones[9][1]           # a gold ring on his little finger
                ring = tube([lerp(a_, b_, 0.35), lerp(a_, b_, 0.62)], lambda u, ang: 4.4, n=10)
                sc.add(mirrored(ring), light.skin(C['ring'], shine=0.6), hx_)
        # the neck, the head, its ears and hair, what stands round the neck, the cap
        hxf = b.head_xf(xf)
        hd = self.head
        hl = self.head_light
        sc.add(hd.mesh(), light.skin(C['skin'], tex=hd.face(self.face_pal(t), self.face_extra(t), 2.0 * px), t_lit=self.t_face,
                                     light=hl, blacks=self.face_black), hxf)
        sc.add(hd.neck(), light.skin(C['skin'], t_lit=self.t_face, light=hl, blacks=self.face_black), hxf)
        st = t['skin']
        ear = light.skin(C['skin'], light=hl, blacks=self.face_black, tex=lambda a, level, n: (st['shade'] if level in ('lit', 'hi') else
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

    # -------------------------------------------------------------- the hands, drawn
    def hand_place(self, s, sc, xf):
        """How his hand s is drawn (hands.py): (design, wrist (panel px), angle, size, mirror). Its keys: 'pose' (a
        DESIGNS name: 'relaxed', 'fist', 'grip', 'hook', 'pinch', 'match', 'point', 'open', 'riffle', 'torch', 'can';
        by default from its shape), 'view' ('back', 'palm', 'side', 'front'; by default from where its palm looks),
        'angle' (degrees; by default along the fingers' 3D direction), 'mirror' (by default from the thumb's side),
        'size' (times the drawn size: a hand drawn a little larger than life, 95 units from the wrist to the tips,
        a little shorter when it points toward us), 'aim' (anchor name, body point: turned and sized so that the
        design's anchor lands there)."""
        from . import hands as H
        b, h, k = self.body, self.hands[s], xf.scale()
        F = self.hand_frame(s)
        col = lambda j: (F[0][j], F[1][j], F[2][j])
        wrist = sc.project(xf(b.wrist[s]))
        tip = sc.project(xf(add(b.wrist[s], mul_(col(1), 60.0))))
        palm_z = xf.normal(col(2))[2]
        pose = h.get('pose') or ('fist' if h.get('shape') is FIST_ else 'relaxed')
        view = h.get('view') or ('palm' if palm_z > 0.35 else 'back' if palm_z < -0.35 else 'side')
        if view not in H.DESIGNS[pose]:
            view = next(iter(H.DESIGNS[pose]))
        d = H.design(pose, view)
        ang = h.get('angle')
        if ang is None:
            ang = math.degrees(math.atan2(tip[0] - wrist[0], -(tip[1] - wrist[1])))
        mirror = h.get('mirror')
        if mirror is None:
            # the thumb's side: a right hand's on its own -x, a left (mirrored) hand's on +x; the design's is on
            # its -x, but in a palm view
            thumb = sc.project(xf(add(b.wrist[s], mul_(col(0), -30.0 if s == 'r' else 30.0))))
            c_, s_ = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            side_sign = 1.0 if view == 'palm' else -1.0
            mirror = ((-c_) * (thumb[0] - wrist[0]) + (-s_) * (thumb[1] - wrist[1])) * (-side_sign) < 0
        reach = math.hypot(tip[0] - wrist[0], tip[1] - wrist[1]) / (60.0 * k)
        size = 95.0 * k * h.get('size', 1.0) * (0.6 + 0.4 * min(1.0, reach))
        if h.get('aim'):
            name, p = h['aim']
            ang, sz = H.aim(d, wrist, sc.project(xf(p)), name, mirror)
            size = max(0.6 * size, min(1.3 * size, sz))
        return d, wrist, ang, size, mirror

    def draw_hands(self, cv, sc, xf, light, layers=('back', 'front'), sides=('r', 'l')):
        """Ink his hands (hands.py designs, placed by hand_place) where his arms end, after sc.render(cv); hidden
        where the render is nearer than the hand ('back' layers hide behind what he holds, 'front' ones show over
        it). Returns {side: hand_place's tuple}, to find a design's anchors (hands.place)."""
        from . import hands as H
        b, k = self.body, xf.scale()
        t = light.tones(self.C['skin'])
        L = sc.light
        out = {}
        for s in sides:
            d, wrist, ang, size, mirror = out[s] = self.hand_place(s, sc, xf)
            zh = sc.project(xf(b.wrist[s]))[2]
            for lay in layers:
                tol = (60.0 if lay == 'front' else 6.0) * k + 2.0
                vis = bytes(255 if z < zh + tol else 0 for z in sc.zbuf)
                H.draw(cv, d, wrist, ang, size, mirror=mirror, light=(L[0], L[1]), skin=(t['lit'], t['shade']),
                       ink=3 if size >= 80 else 2, layers=(lay,), visible=Image.frombytes('L', (sc.w, sc.h), vis))
        return out

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
                    return mix(t['skin'][level], t['stubble'][level], 0.45)
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

    def sleeve_skin(self, light, t, folds, least=0.0):
        C, outfit = self.C, self.outfit
        base = C['coat'] if (outfit == 'coat' or self.who.get('overcoat')) and not self.bare else \
            C['knit'] if outfit == 'knit' else C['jacket']
        cuff = t['rib'] if outfit == 'bomber' else t['knit'] if outfit == 'knit' else None

        def ribbed(a, level, n):
            return cuff[level] if cuff and a[0] > 0.92 else None
        return light.skin(base, shine=0.15 if outfit == 'leather' else 0.0, tex=fold_tex(folds, ribbed, least))

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
            if style in ('slick', 'ponytail', 'boss') and level in ('lit', 'hi') and (th + 2.0 * math.sin(th * 0.7)) % 15.0 < 2.2:
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
            # tied at the back of the head, it stands out from the nape and falls: it shows against any light
            path = [(0, 42, -44), (0, 50, -54), (0, 64, -61), (0, 82, -63), (0, 100, -58)]
            sc.add(tube(path, lambda u, a: 7.5 * (1 - 0.55 * u) + 3.0 * bell((u - 0.3) / 0.35), n=12, up=(1, 0, 0)),
                   skin, hxf)
            sc.add(tube([(0, 44, -47), (0, 50, -52)], lambda u, a: 8.2, n=12), light.skin(self.C['band']), hxf)
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
            rn = hd.m['neck'] + 4.5
            rows, centers = [], []
            ang = [i * 10.0 for i in range(37)]
            for y in (70.5, 75.0, 80.0, 86.0, 92.0, 98.0, 104.0, 112.0, 122.0):
                row = []
                for a in ang:
                    s_, c_ = math.sin(math.radians(a)), math.cos(math.radians(a))
                    q = (s_ * rn, y, -8 + c_ * rn * 1.05)
                    if y <= 104:
                        p = hd.point(min(y, 95.0), a, 2.2 + 1.6 * bell((y - 70) / 7) * max(0.0, c_))
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
        """His flat cap: soft, low on the head; its crown a sloping top wider than the skull, high at the back and
        pulled down forward onto a short stiff peak low over his eyes; a seam down its top, a button."""
        C, hd = self.C, self.head
        band = Curve([(0, 29), (40, 31), (80, 38), (120, 43), (180, 45)])

        def off(p, phi):
            k = (band(phi) - p[1]) / 2.0
            return 4.5 * min(1.0, k) if k > 0 else 1.5 * max(-1.0, k)
        crown = hd.shell(off, y_max=50)
        verts = []
        for v in crown.verts:
            # soft: wider than the skull above the band, its top pulled forward and down over the peak
            up = smooth(30, 8, v[1])
            front = smooth(-10, 30, v[2])
            x = v[0] * (1 + 0.07 * up)
            y = v[1] + 3.0 * up * front * smooth(10, 30, v[2])
            z = v[2] + 11.0 * up * front * smooth(4, 20, v[1])
            verts.append((x, y, z))
        crown.verts, crown.normals = verts, None
        crown.attrs = verts
        def tex(a, level, n):
            x, y, z = a
            if abs(x) < 0.7 and y < 16:
                return INK                                            # the seam down its top
            return None
        cap = light.skin(C['cap'], tex=tex)
        sc.add(crown, cap, hxf)
        # the peak: short and stiff, from the cap's front edge, tipped down over the brow
        rows = []
        for j in range(4):
            k = j / 3
            row = []
            for i in range(13):
                a = -62 + i * (124 / 12)
                p = hd.point(band(abs(a)), a, 2.6)
                reach = 13.0 * k * math.cos(math.radians(a * 1.1)) ** 0.5
                row.append(add(p, (math.sin(math.radians(a)) * reach * 0.4, 5.0 * k + 1.0 * k * k,
                                   math.cos(math.radians(a)) * reach)))
            rows.append(row)
        top = grid(rows)
        under = grid([[add(p, (0, 1.6, 0)) for p in r] for r in rows])
        under.tris = [(i, k, j) for i, j, k in under.tris]
        sc.add(top, cap, hxf)
        sc.add(under, cap, hxf)
        sc.add(tube([(0, -1.5, 2.0), (0, -3.5, 2.5)], lambda u, a: 3.0, n=10), light.skin(C['button']), hxf)
