"""The comic kit's 3D layer: a small toon renderer, pure Python + Pillow, deterministic.

People, hands and what they hold are built as meshes (lofted rings, tubes along bones, boxes) in model units (a head
is 100 from crown to chin, see cast.py), placed by an Xf (model -> panel px, rotation, scale, mirror), rasterised
into a depth buffer at the panel's own px (aliased: pixel art), then shaded FLAT: each pixel takes one of a skin's few
tones by how it faces the key light (`lit`, `shade`, `deep`, an optional `hi`), with cast shadows from the key light
(a shadow map), a rim of the back lights along the edges, and the ink: an outline round the silhouette, heavier on
the side away from the light, and a line wherever one surface passes in front of another (a jump in depth). Detail
(eyes, lips, lapels, nails, the print on a bank note) is painted per pixel by a skin's `tex` from the point's model
coordinates, so it turns, foreshortens and hides with the surface.

Coordinates: panel px, x right, y down, z toward the viewer (bigger z is nearer). Light directions point TOWARD the
light, in the same space (a lamp low in front: (0, 0.7, 0.7)).
"""
import math

from PIL import Image, ImageChops, ImageFilter

from .kit import INK, shift


# ---------------------------------------------------------------- vectors, rotations
def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def mul(a, k):
    return (a[0] * k, a[1] * k, a[2] * k)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def unit(a):
    d = math.sqrt(dot(a, a)) or 1.0
    return (a[0] / d, a[1] / d, a[2] / d)


def lerp(a, b, u):
    return (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u)


def rot(axis, deg):
    """The rotation matrix (rows) of deg degrees about a unit axis (right-handed in x right, y down, z to us)."""
    x, y, z = unit(axis)
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    t = 1 - c
    return ((t * x * x + c, t * x * y - s * z, t * x * z + s * y),
            (t * x * y + s * z, t * y * y + c, t * y * z - s * x),
            (t * x * z - s * y, t * y * z + s * x, t * z * z + c))


IDENT = ((1, 0, 0), (0, 1, 0), (0, 0, 1))


def mm(a, b):
    """Matrix product a . b (3 x 3, rows)."""
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)) for i in range(3))


def mv(m, v):
    return (m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2])


def ypr(yaw=0.0, pitch=0.0, roll=0.0):
    """A turn: yaw about the vertical (positive turns the front toward +x, the viewer's right), then pitch (positive
    tips the front down), then roll in the picture's plane (positive clockwise)."""
    return mm(rot((0, 0, 1), roll), mm(rot((1, 0, 0), -pitch), rot((0, 1, 0), yaw)))


def frame(fwd, up):
    """The rotation taking model +y to fwd and model +z to (up made square to fwd): a hand's or a prop's frame from
    where it points and where its face looks."""
    y = unit(fwd)
    z = unit(sub(up, mul(y, dot(up, y))))
    x = cross(y, z)
    return ((x[0], y[0], z[0]), (x[1], y[1], z[1]), (x[2], y[2], z[2]))


class Xf:
    """model -> panel: p' = s * F(M p) + (ox, oy, oz), F mirroring x when f is -1. Compose with `then`."""

    def __init__(self, ox=0.0, oy=0.0, s=1.0, m=IDENT, f=1, oz=0.0):
        self.m = tuple(tuple(v * s * (f if i == 0 else 1) for v in row) for i, row in enumerate(m))
        self.t = (ox, oy, oz)

    @staticmethod
    def raw(m, t):
        x = Xf()
        x.m, x.t = m, t
        return x

    def __call__(self, p):
        return add(mv(self.m, p), self.t)

    def normal(self, n):
        return unit(mv(self.m, n))

    def at(self, p, m=IDENT):
        """This placement applied after a local one: a part at p (in these model units) turned by m."""
        return Xf.raw(mm(self.m, m), self(p))

    def scale(self):
        return math.sqrt(abs(self.m[0][0] ** 2 + self.m[1][0] ** 2 + self.m[2][0] ** 2))


# ---------------------------------------------------------------- meshes
class Mesh:
    """Triangles: verts [(x, y, z)], attrs [tuple] (what a skin's tex reads: the model point by default), tris
    [(i, j, k)]; smooth: normals shared at a vertex (else flat per face)."""

    def __init__(self, verts, tris, attrs=None, smooth=True):
        self.verts, self.tris, self.smooth = verts, tris, smooth
        self.attrs = attrs if attrs is not None else verts
        self.normals = None

    def normals_(self):
        if self.normals is not None:
            return self.normals
        V = self.verts
        fn = []
        for i, j, k in self.tris:
            a, b, c = V[i], V[j], V[k]
            ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
            vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
            fn.append((uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx))
        if not self.smooth:
            self.normals = [unit(n) for n in fn]
            return self.normals
        # shared by every vertex at the same place (a ring's seam, a pole), so no seam shows in the light
        keys = [(int(v[0] * 256 + 0.5), int(v[1] * 256 + 0.5), int(v[2] * 256 + 0.5)) for v in V]
        acc = {}
        for (i, j, k), n in zip(self.tris, fn):
            for key in (keys[i], keys[j], keys[k]):
                a = acc.get(key)
                acc[key] = n if a is None else (a[0] + n[0], a[1] + n[1], a[2] + n[2])
        self.normals = [unit(acc.get(key, (0, 0, 1))) for key in keys]
        return self.normals


def grid(rows, attrs=None, centers=None, smooth=True):
    """A mesh through rows of points (each row the same count, rows next to each other: rings of a loft or a tube,
    their first point repeated at the end when closed). centers: a point inside each row, to turn the normals out."""
    verts, at, tris = [], [], []
    n = len(rows[0])
    for r, row in enumerate(rows):
        verts.extend(row)
        at.extend(attrs[r] if attrs else row)
    for r in range(len(rows) - 1):
        for i in range(n - 1):
            a, b, c, d = r * n + i, r * n + i + 1, (r + 1) * n + i, (r + 1) * n + i + 1
            tris.append((a, c, b))
            tris.append((b, c, d))
    mesh = Mesh(verts, tris, at, smooth)
    if centers:
        nr = mesh.normals_()
        score = 0.0
        for r, row in enumerate(rows):
            for i, p in enumerate(row):
                score += dot(nr[r * n + i], sub(p, centers[r]))
        if score < 0:
            mesh.tris = [(i, k, j) for i, j, k in tris]
            mesh.normals = None
    return mesh


def merge(meshes):
    """One mesh of several (smooth ones keep the normals they had)."""
    verts, attrs, tris, normals = [], [], [], []
    for m in meshes:
        o = len(verts)
        verts.extend(m.verts)
        attrs.extend(m.attrs)
        tris.extend((i + o, j + o, k + o) for i, j, k in m.tris)
        if m.smooth:
            normals.extend(m.normals_())
    out = Mesh(verts, tris, attrs, meshes[0].smooth)
    if out.smooth:
        out.normals = normals
    return out


def ring_frames(path, up):
    """Square frames along a polyline (parallel transport from `up`): [(tangent, normal, binormal)]."""
    out = []
    n = len(path)
    prev_n = None
    for i in range(n):
        a, b = path[max(0, i - 1)], path[min(n - 1, i + 1)]
        t = unit(sub(b, a))
        ref = up if prev_n is None else prev_n
        nn = sub(ref, mul(t, dot(ref, t)))
        if dot(nn, nn) < 1e-9:
            nn = cross(t, (1, 0, 0)) if abs(t[0]) < 0.9 else cross(t, (0, 1, 0))
        nn = unit(nn)
        out.append((t, nn, cross(t, nn)))
        prev_n = nn
    return out


def tube(path, radius, n=14, up=(0, 0, 1), caps=(True, True), squash=None, attr=None):
    """A tube along path (>= 2 points), radius(u, a) at u 0..1 along it and a degrees round it (a 0 on the `up` side,
    90 on the side of tangent x up); squash(u): the cross-section's width across `up` over its depth. caps: rounded
    ends (half spheres). attr(u, a, p): the tex attribute of a point (default (u, a, 0))."""
    total = [0.0]
    for i in range(1, len(path)):
        total.append(total[-1] + math.dist(path[i - 1], path[i]))
    L = total[-1] or 1.0
    # sample the path finely enough for its bends
    us = []
    for i in range(len(path) - 1):
        seg = max(2, int(math.dist(path[i], path[i + 1]) / L * 24) + 1)
        for k in range(seg):
            us.append((total[i] + (total[i + 1] - total[i]) * k / seg) / L)
    us.append(1.0)

    def at_u(u):
        d = u * L
        for i in range(1, len(total)):
            if d <= total[i] or i == len(total) - 1:
                k = (d - total[i - 1]) / ((total[i] - total[i - 1]) or 1)
                return lerp(path[i - 1], path[i], max(0.0, min(1.0, k)))
    pts = [at_u(u) for u in us]
    frames = ring_frames(pts, up)
    rows, at, centers = [], [], []
    angles = [360.0 * k / n for k in range(n + 1)]

    def ring(c, fr, u, k=1.0, push=0.0):
        t, nn, bn = fr
        sq = squash(u) if squash else 1.0
        row, ar = [], []
        for a in angles:
            r = radius(u, a) * k
            ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
            p = add(add(c, mul(t, push)), add(mul(nn, ca * r), mul(bn, sa * r * sq)))
            row.append(p)
            ar.append(attr(u, a, p) if attr else (u, a, 0.0))
        return row, ar
    def cap(c, fr, u, thetas, sign):
        r = max(radius(u, a) for a in angles[:-1])
        for th in thetas:
            row, ar = ring(c, fr, u, math.cos(math.radians(th)), sign * math.sin(math.radians(th)) * r)
            rows.append(row)
            at.append(ar)
            centers.append(c)
    if caps[0]:
        cap(pts[0], frames[0], 0.0, (90, 66, 42, 20), -1)
    for u, c, fr in zip(us, pts, frames):
        row, ar = ring(c, fr, u)
        rows.append(row)
        at.append(ar)
        centers.append(c)
    if caps[1]:
        cap(pts[-1], frames[-1], 1.0, (20, 42, 66, 90), 1)
    return grid(rows, at, centers)


def box(x0, y0, z0, x1, y1, z1, attr=None):
    """An axis-aligned box, its faces flat; attr(p, face) gives a point's tex attribute (default (x, y, z, face)),
    face one of 'x0 x1 y0 y1 z0 z1'."""
    faces = {'x0': [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)],
             'x1': [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)],
             'y0': [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)],
             'y1': [(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)],
             'z0': [(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)],
             'z1': [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]}
    verts, attrs, tris = [], [], []
    for name, q in faces.items():
        o = len(verts)
        verts.extend(q)
        attrs.extend(attr(p, name) if attr else p + (name,) for p in q)
        tris.extend([(o, o + 1, o + 2), (o, o + 2, o + 3)])
    return Mesh(verts, tris, attrs, smooth=False)


def sheet(w, h, bend=None, n=(8, 2), attr=None, back=True):
    """A thin flat sheet (a bank note, a page) w x h in its xy plane, centred, facing +z; bend(u, v) -> z lifts it
    (u, v 0..1 across x and y). Two faces 0.6 apart, the front (attr side 'f') and the back ('b'); back False: the
    front alone (for sheets stacked close, so that they do not fight)."""
    nu, nv = n
    faces = []
    for side, dz in (('f', 0.3), ('b', -0.3)) if back else (('f', 0.0),):
        rows, at = [], []
        for j in range(nv + 1):
            v = j / nv
            row, ar = [], []
            for i in range(nu + 1):
                u = i / nu
                row.append((-w / 2 + u * w, -h / 2 + v * h, (bend(u, v) if bend else 0.0) + dz))
                ar.append(attr(u, v, side) if attr else (u, v, side))
            rows.append(row)
            at.append(ar)
        m = grid(rows, at)
        # its normals out of its own face: the front's toward +z, the back's toward -z
        want = 1 if side == 'f' else -1
        m.normals = [mul(q, -1) if q[2] * want < 0 else q for q in m.normals_()]
        faces.append(m)
    return merge(faces)


# ---------------------------------------------------------------- skins
class Skin:
    """How a surface takes the light: tones {'lit', 'shade', 'deep', 'hi', 'rim'} (deep and hi optional), and tex(a,
    level, n) -> a colour or None (None: the tone), a: the point's attribute, level one of 'hi lit shade deep'.
    t_lit / t_hi / t_deep: the thresholds on n . light. ink: an outline where it passes in front of another surface.
    light: a direction of its own for the key light (a cheat of the illustrator's: the face lit from below by the
    lamp, what he holds from in front), its shadows cast along it by the surfaces that share it alone. blacks False: it never goes to solid black (paper,
    an eye's white), a number: its own threshold for them (see Scene). creases False: no line where it folds sharply (fingers side by side, seen small)."""

    def __init__(self, lit, shade, deep=None, hi=None, rim=None, tex=None, t_lit=0.1, t_hi=0.8, t_deep=-0.5,
                 ink=True, light=None, blacks=True, creases=True):
        self.tones = {'lit': lit, 'shade': shade, 'deep': deep or shade, 'hi': hi or lit}
        self.rim, self.tex, self.ink, self.creases = rim, tex, ink, creases
        self.blacks = blacks       # True: the scene's threshold; a number: its own; False: never
        self.light = unit(light) if light else None
        self.t_lit, self.t_hi, self.t_deep = t_lit, t_hi, t_deep

    def level(self, d, shadowed):
        if shadowed:
            return 'deep' if d < self.t_deep else 'shade'
        if d > self.t_hi and self.tones['hi'] is not self.tones['lit']:
            return 'hi'
        if d > self.t_lit:
            return 'lit'
        return 'deep' if d < self.t_deep else 'shade'

    def colour(self, a, level, n):
        if self.tex:
            c = self.tex(a, level, n)
            if c is not None:
                return c
        return self.tones[level]


# ---------------------------------------------------------------- the scene
def _raster(tris, W, H, zb, ids=None, b1=None, b2=None, first=0):
    """Scan triangles [(ax, ay, az, bx, by, bz, cx, cy, cz)] into the depth buffer zb (nearest wins); ids/b1/b2: the
    winning triangle (first + its index) and its barycentric weights of b and c at each px."""
    for ti, (ax, ay, az, bx, by, bz, cx, cy, cz) in enumerate(tris):
        x0 = max(0, int(min(ax, bx, cx)))
        x1 = min(W - 1, int(max(ax, bx, cx)))
        y0 = max(0, int(min(ay, by, cy)))
        y1 = min(H - 1, int(max(ay, by, cy)))
        if x0 > x1 or y0 > y1:
            continue
        area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        if abs(area) < 1e-9:
            continue
        inv = 1.0 / area
        # weights of b and c as linear functions of the px centre
        ub, vb, wb = (cy - ay) * inv, -(cx - ax) * inv, (-(cy - ay) * ax + (cx - ax) * ay) * inv
        uc, vc, wc = -(by - ay) * inv, (bx - ax) * inv, ((by - ay) * ax - (bx - ax) * ay) * inv
        dzb, dzc = bz - az, cz - az
        tid = first + ti
        for y in range(y0, y1 + 1):
            py = y + 0.5
            rb = vb * py + wb
            rc = vc * py + wc
            row = y * W
            for x in range(x0, x1 + 1):
                px = x + 0.5
                wB = ub * px + rb
                if wB < -1e-7:
                    continue
                wC = uc * px + rc
                if wC < -1e-7 or wB + wC > 1.0000001:
                    continue
                z = az + dzb * wB + dzc * wC
                i = row + x
                if z > zb[i]:
                    zb[i] = z
                    if ids is not None:
                        ids[i] = tid
                        b1[i] = wB
                        b2[i] = wC


CODE = {'deep': 40, 'shade': 100, 'lit': 170, 'hi': 240}
LEVEL = {v: k for k, v in CODE.items()}


class Scene:
    """What is drawn together (it hides itself, takes one light): add meshes with their skin and placement, then
    render onto a Cv. light: the key light's direction (toward it); shadows: cast by the key light; rims: [(direction,
    colour or None for each skin's own rim, threshold)], back lights that only touch the edges (rim_px: how deep
    into the silhouette their band may reach, None: anywhere); scale: px per model unit, for the ink's weight and
    the depth a line needs (gap, in model units). lamp (x, y, z): a lamp at that panel point instead of a light from
    far away (its shadows are still cast along `light`: aim that from the lamp at what matters). simplify: an odd
    size (3, 5, 7): the shapes of light and shadow cleaned of specks smaller than about that, as an inker would.
    blacks: the inker's solid blacks: what is turned further from the key than this (n . light below it) or in a cast
    shadow goes to the skins' deep tone (make it INK with Light(deep=1)). persp (D, cx, cy): a camera D px in front
    of the picture, looking at (cx, cy): what is nearer grows (a close foreground). keystone (cx, y0, k): seen from
    low, looking up: what stands higher than y0 drawn in toward x cx, by k of itself a panel's height up. inner / crease_w:
    the weight of a line where one form passes in front of another / where a form folds."""

    def __init__(self, w, h, light=(0, -0.6, 0.8), shadows=True, rims=(), scale=1.0, ink=None, inner=None, gap=6.0,
                 rim_px=None, crease=0.2, lamp=None, simplify=0, blacks=None, persp=None, crease_w=1, keystone=None):
        self.w, self.h = w, h
        self.blacks = blacks
        self.persp, self.keystone = persp, keystone
        self.crease_w = crease_w
        self.light = unit(light)
        self.lamp = lamp
        self.simplify = simplify
        self.shadows = shadows
        self.rims = [(unit(d), c, t) for d, c, t in rims]
        self.scale = scale
        self.ink = ink if ink is not None else (4 if scale >= 0.9 else 3)
        self.inner = inner if inner is not None else 2
        self.gap = gap
        self.rim_px = rim_px
        self.crease = crease
        self.tris, self.data, self.casts = [], [], []    # screen triangles, (skin, normals, attrs), shadow or not
        self.zbuf = None

    def add(self, mesh, skin, xf, cast=True):
        """Add a mesh with its skin, placed by xf (model -> panel px); cast False: it throws no shadow."""
        nr = mesh.normals_()
        V = [xf(v) for v in mesh.verts]
        if self.persp or self.keystone:
            V = [self.project(p) for p in V]
        if mesh.smooth:
            N = [xf.normal(n) for n in nr]
        A = mesh.attrs
        for fi, (i, j, k) in enumerate(mesh.tris):
            a, b, c = V[i], V[j], V[k]
            self.tris.append(a + b + c)
            self.casts.append(cast)
            if mesh.smooth:
                self.data.append((skin, N[i], N[j], N[k], A[i], A[j], A[k]))
            else:
                n = xf.normal(nr[fi])
                self.data.append((skin, n, n, n, A[i], A[j], A[k]))

    # -------------------------------------------------------------- the passes
    def _shadow_map(self, L, own=False):
        ax = unit(cross((0, 1, 0) if abs(L[1]) < 0.9 else (1, 0, 0), L))
        ay = cross(L, ax)
        P = [(dot(t[0:3], ax), dot(t[0:3], ay), dot(t[0:3], L), dot(t[3:6], ax), dot(t[3:6], ay), dot(t[3:6], L),
              dot(t[6:9], ax), dot(t[6:9], ay), dot(t[6:9], L)) for t, c, d in zip(self.tris, self.casts, self.data)
             if c and (not own or d[0].light == L)]
        if not P:
            return None
        mx = min(min(p[0], p[3], p[6]) for p in P) - 2
        my = min(min(p[1], p[4], p[7]) for p in P) - 2
        Mx = max(max(p[0], p[3], p[6]) for p in P) + 2
        My = max(max(p[1], p[4], p[7]) for p in P) + 2
        W, H = int(Mx - mx) + 1, int(My - my) + 1
        zb = [-1e18] * (W * H)
        _raster([(p[0] - mx, p[1] - my, p[2], p[3] - mx, p[4] - my, p[5], p[6] - mx, p[7] - my, p[8]) for p in P], W, H, zb)
        return (ax, ay, L, mx, my, W, H, zb)

    def render(self, cv, clip=None):
        """Draw onto cv (its im). Returns the mask of what was drawn (ink included), for rims or clipping after."""
        W, H = self.w, self.h
        n = W * H
        zb = [-1e18] * n
        ids = [-1] * n
        b1 = [0.0] * n
        b2 = [0.0] * n
        _raster(self.tris, W, H, zb, ids, b1, b2)
        self.zbuf = zb
        maps = {}

        def shadow_map(L):
            if L not in maps:
                maps[L] = self._shadow_map(L, own=L != self.light)
            return maps[L]
        bias0 = max(1.5, 2.5 * self.scale)
        lamp = self.lamp
        col = [None] * n
        levels = bytearray(n)
        rim = [None] * n
        nb = [None] * n
        inked = bytearray(n)
        cover = bytearray(n)
        for i in range(n):
            t = ids[i]
            if t < 0:
                continue
            skin, n0, n1, n2, a0, a1, a2 = self.data[t]
            wb, wc = b1[i], b2[i]
            wa = 1.0 - wb - wc
            nrm = unit((n0[0] * wa + n1[0] * wb + n2[0] * wc, n0[1] * wa + n1[1] * wb + n2[1] * wc,
                        n0[2] * wa + n1[2] * wb + n2[2] * wc))
            Ls = skin.light or self.light
            if skin.light:
                L = skin.light
            elif lamp is not None:
                L = unit((lamp[0] - i % W - 0.5, lamp[1] - i // W - 0.5, lamp[2] - zb[i]))
            else:
                L = self.light
            d = dot(nrm, L)
            shadowed = False
            sm = shadow_map(Ls) if self.shadows else None
            if sm is not None and d > skin.t_lit:
                ax, ay, az, mx, my, sw, sh, szb = sm
                p = (i % W + 0.5, i // W + 0.5, zb[i])
                u, v = int(dot(p, ax) - mx), int(dot(p, ay) - my)
                bias = bias0 + 2.0 * math.sqrt(max(0.0, 1 - d * d)) / max(d, 0.15)
                if 0 <= u < sw and 0 <= v < sh and szb[v * sw + u] > dot(p, az) + bias:
                    shadowed = True
            lv = skin.level(d, shadowed)
            if self.blacks is not None and skin.blacks is not False:
                tb = self.blacks if skin.blacks is True else skin.blacks
                if shadowed or d < tb:
                    lv = 'deep'
            levels[i] = CODE[lv]
            if isinstance(a0[0], str) or len(a0) == 0:
                a = a0
            else:
                a = tuple((a0[k] * wa + a1[k] * wb + a2[k] * wc) if isinstance(a0[k], (int, float)) else a0[k]
                          for k in range(len(a0)))
            col[i] = (skin, a, nrm)
            for rd, rc, rt in self.rims:
                if dot(nrm, rd) > rt:
                    rcol = rc if rc is not None else skin.rim
                    if rcol is not None:
                        rim[i] = rcol
                        break
            nb[i] = nrm
            inked[i] = (2 if skin.creases else 1) if skin.ink else 0
            cover[i] = 255
        if self.simplify:
            # the light's shapes made simple, as an inker would: specks and slivers of a tone go to their neighbours'
            lv = Image.frombytes('L', (W, H), bytes(levels)).filter(ImageFilter.ModeFilter(self.simplify)).tobytes()
            levels = bytearray(lv[i] or levels[i] for i in range(n))
        for i in range(n):
            if col[i] is not None:
                skin, a, nrm = col[i]
                col[i] = skin.colour(a, LEVEL[levels[i]], nrm)
        cov = Image.frombytes('L', (W, H), bytes(cover))
        # a rim only reaches rim_px into the silhouette
        deep_in = cov.filter(ImageFilter.MinFilter(2 * self.rim_px + 1)).tobytes() if self.rim_px else None
        out = []
        for i in range(n):
            c = col[i]
            if c is None:
                out.append((0, 0, 0))
            elif rim[i] is not None and not (deep_in and deep_in[i]):
                out.append(rim[i])
            else:
                out.append(c)
        self.colours = col
        img = Image.new('RGB', (W, H))
        img.putdata(out)
        # the ink: lines where a surface passes in front of another or folds sharply, the outline round everything
        gap = self.gap * self.scale
        crease = self.crease
        lines = bytearray(n)
        folds = bytearray(n)
        for y in range(H):
            row = y * W
            for x in range(W):
                i = row + x
                if not cover[i]:
                    continue
                zi = zb[i]
                for j in ((i + 1) if x + 1 < W else -1, (i + W) if y + 1 < H else -1):
                    if j < 0 or not cover[j]:
                        continue
                    dz = zi - zb[j]
                    if dz > gap and inked[i]:
                        lines[j] = 255
                    elif -dz > gap and inked[j]:
                        lines[i] = 255
                    elif crease is not None and inked[i] == 2 and inked[j] == 2 and dot(nb[i], nb[j]) < crease:
                        folds[j if dz > 0 else i] = 255

        def weigh(m, w):
            if w == 2:
                return ImageChops.lighter(m, shift(m, 1, 1))
            if w > 2:
                return m.filter(ImageFilter.MaxFilter(3 if w < 5 else 5))
            return m
        # a contour that breaks (one form in front of another) inked heavier than a fold within a form
        lm = ImageChops.lighter(weigh(Image.frombytes('L', (W, H), bytes(lines)), self.inner),
                                weigh(Image.frombytes('L', (W, H), bytes(folds)), self.crease_w))
        # the outline: ink - 1 px all round (1 at the least), one more on the side away from the light
        k = self.ink
        grown = cov.filter(ImageFilter.MaxFilter(2 * max(1, k - 1) + 1))
        if k >= 2:
            sx, sy = -self.light[0], -self.light[1]
            d = math.hypot(sx, sy) or 1.0
            grown = ImageChops.lighter(grown, shift(grown, round(sx / d), round(sy / d)))
        ring = ImageChops.subtract(grown, cov)
        if clip is not None:
            cov = ImageChops.multiply(cov, clip)
            ring = ImageChops.multiply(ring, clip)
            lm = ImageChops.multiply(lm, clip)
        cv.im.paste(img, (0, 0), cov)
        cv.im.paste(INK, (0, 0), ImageChops.lighter(ring, lm))
        return ImageChops.lighter(cov, ring)

    def project(self, p):
        """A panel point (after its Xf) where the scene draws it: through the camera's perspective, if any."""
        if self.persp:
            D, cx, cy = self.persp
            k = D / (D - p[2])
            p = (cx + (p[0] - cx) * k, cy + (p[1] - cy) * k, p[2])
        if self.keystone:
            cx, y0, k = self.keystone
            p = (cx + (p[0] - cx) * (1 - k * (y0 - p[1]) / self.h), p[1], p[2])
        return p

    # -------------------------------------------------------------- after the render
    def visible(self, p, tol=None):
        """Is the panel point p (x, y, z) in front of (or on) what was rendered there?"""
        x, y = int(p[0]), int(p[1])
        if not (0 <= x < self.w and 0 <= y < self.h):
            return False
        return p[2] >= self.zbuf[y * self.w + x] - (tol if tol is not None else 2.0 * self.scale + 1)


def stroke(cv, scene, pts, w0, w1=None, col=INK, mid=None):
    """An ink stroke along panel points pts (x, y, z), drawn only where they are not hidden (after scene.render)."""
    run = []
    for p in pts + [None]:
        if p is not None and scene.visible(p):
            run.append((p[0], p[1]))
            continue
        if len(run) >= 2:
            cv.brush(run, w0, w1, col=col, mid=mid)
        run = []
