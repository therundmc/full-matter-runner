# The comic's art bible

Every still of the opening, the leap's card and the endings is painted by code (`python tools/generate_comic.py`,
deterministic, Pillow only). Read this before drawing a panel; `count` and `door` (tools/comic/panels/opening2.py,
opening1.py) are the reference panels.

## The package

| file | what |
|---|---|
| `generate_comic.py` (tools/) | the entry point: paints every registered panel, asserts its size, writes assets/sprites/comic/ |
| `comic/kit.py` | 2D: `Cv` (fill, ink, brush, rect, ellipse, mask), `T`, `spline`, the palette, `backlit`, `ripples`, `window_night`, `rain_beads`, `@panel(name, size)` |
| `comic/solid.py` | the 3D toon renderer: `Scene`, `Skin`, `Xf`, meshes (`tube`, `grid`, `box`, `sheet`, `merge`), `ypr`, `frame`, `rot` |
| `comic/anatomy.py` | the parts: `Head` (lofted, features painted on), `Body` (spine, IK arms and legs), `Hand` and its shapes, `shoe` |
| `comic/cast.py` | the characters (`HERO`, `HEAVY`, `SLICK`, `YOUNG`, `BOSS`), `Figure` (dresses and adds a posed man), `Light` (a panel's colours), `hand_parts` |
| `comic/props.py` | what they hold: `brick` and `riffled` (money), `torch`, `crowbar`, `jerrycan` |
| `comic/legacy.py` | the first pass's 2D heads and silhouettes, for the panels not yet redrawn: do not use in new work, delete what goes unused |
| `comic/panels/<page>.py` | one module per page; each panel a function decorated `@panel('name', (w, h))` |
| `comic/sheet.py` | the model sheet (not shipped): `python tools/comic/sheet.py out.png` |

Panel names and sizes are fixed (the game's layouts and tests depend on them), and so are the points the game draws
over (FLAME, GAP, CLOCK, the window PANE of `sleep`, ALLEY_END, ALLEY_PUDDLES, DRIVE_MIRROR, DRIVE_GLASS,
OFFICE_SMOKE, OFFICE_DRIP, MATCH_COVER, the doorway 664..828 x 8..222 of `door`): ui/cine/Panels.js, Leap.js,
Ending.js read them. If a panel needs one to move, stop and say so.

## Look

- Neon noir: a night in flat blues and purples; neon pink (`PINK`) and cyan (`CYAN`), the orange of a match and of
  fire (`FIRE*`), green money, red blood. Wet ground gives the lights back broken into horizontal ripples.
- Flat tones and a dark ink line. NO gradient, dither, screentone, blur or anti-aliasing: everything is aliased at the
  panel's own px (SC = 3 panel px per title px).
- NO off-register doubling. It read as a glitch and is gone from the pipeline; never ghost a person or an object.
  The only allowed echo of it: a 1 px offset on the very brightest neon tube of a sign, nowhere else.
- People: real anatomy, 7.5 heads tall, joints where they belong, weight on the feet, a clear gesture. Staging like
  Mazzucchelli's Year One or Phillips' Criminal: one idea per panel, readable silhouettes, big shadow shapes.

## Proportions (model units: a head is 100 from crown to chin, 1 unit = 2.3 mm)

- Standing man 750 tall, feet on y 0, up is -y; shoulders about 2 heads wide (Build.shoulder 71..86 half joint
  distance), elbows at the waist, wrists at the crotch, fingertips mid-thigh; hand 82 long (palm 44), a head's eyes
  at mid-height.
- The builds: the heavy wide and deep with a belly, a shaved skull, a thick neck; the slick one narrow, hollow
  cheeks, a hooked nose, oiled hair, a pencil moustache; the young one athletic, a square stubbled jaw, a ponytail, a
  scar through his right brow; the boss heavy, jowls, grey hair combed back, a cream suit; the hero medium, his cap,
  his scarf over his mouth, a long charcoal coat, the satchel's strap across him (bare=True: at home in his grey
  knit, hair to the collar).
- Real sizes for props: a bank note 68 x 29, a brick of notes 12+ thick, a crowbar 180..260, a jerrycan 46 x 64.

## Light, per panel

1. Pick the panel's colours: `light = Light(key=..., fill=...)`: key is what the light is (lamp `#ffc890`, tube
   `#7ad8e4`, fire `FIRE_L`), fill what the shadows are bathed in (a night violet, `#3a3658`..`#5a4a90`). `deep`
   (0..1) is how near the ink the deepest shadow goes: 0.55 by default, 0.7 for silhouettes.
2. Aim it: `Scene(w, h, light=(dx, dy, dz) toward the light, ...)` (x right, y DOWN, z toward us). Under-light:
   `(0.1, 0.9, 0.35)`; three quarters from the upper left: `(-0.5, -0.45, 0.75)`; back-lit: `(0.15, -0.35, -0.92)`.
   A lamp in the panel: `lamp=(x, y, z)`. One face may take its own key (`Figure(head_light=...)`) when the lamp
   that lights his face is not the one that lights what he holds: the illustrator's cheat, used in `count`.
3. Rims: `rims=[(direction, colour, threshold)]` with `rim_px` 2..3 for a neon behind a lit figure; for a figure
   black against a bright doorway or window, render with no rims and run `backlit(cv, mask, colour, sides)` on the
   mask `Scene.render` returns (crisp 2 px edges, as in `door`).
4. `simplify=5..7` (an odd size) cleans the light's shapes of specks, as an inker would; use it on close-ups.
5. Cast shadows are on (`shadows=True`); `Scene.add(..., cast=False)` and `Figure(hand_shadows=False)` keep a
   prop or the hands from darkening a face they should not.

## Line weights (panel px)

- Outline: `Scene(ink=...)`: 2 for close-ups (`count`, s about 1.2), 1 for full figures at door scale (s about
  0.25); it is heavier by 1 px on the side away from the light by itself.
- Inner lines (one surface passing in front of another, sharp folds): `inner=1`. 2D brush work in kit: 3..4 for
  furniture, 1.5..2.5 for folds and creases.

## Using the cast

```python
light = Light(key=hx('#ffc890'), fill=hx('#5a4a90'))
fig = Figure(SLICK,
             pose=dict(chest=ypr(4, 10, 0), head=ypr(-14, 10, 4),            # yaw, pitch (down), roll
                       wrist_l=(46, -612, 116), elbow_l=(1, 0.7, -0.3)),      # IK target and elbow pole
             hands=dict(l=dict(shape=flat(curl=10, thumb=(-8, 47, 21)), fwd=(-0.9, 0.1, 0.42), palm=(0.05, -0.8, 0.6))),
             face=dict(smile=(0.15, 0.85), gaze=(-1.8, 2.8), lids=0.5, squint=0.45, brow_lift=(0, 0.6)))
place = Xf(ox, oy, s, ypr(-40))          # body space -> panel px: (ox, oy) is where his feet stand
fig.add(sc, place, light)
m, skin = props.brick(light)
sc.add(m, skin, fig.hand_xf('l', place).at((0, 74, 7.5)))   # in his left hand's own space
sc.render(cv)
```

- Body space: he faces +z, his right ('r') is on -x. Pose keys: `root`, `pelvis`, `chest`, `head` (turns),
  `wrist_r/l` + `elbow_r/l` (pole), `ankle_r/l` + `knee_r/l` + `toe_r/l`. Arms are 144 + 120 long: a wrist further
  than that from the shoulder is not reached (the hand then floats off its prop: check).
- A hand's own space: the wrist at the origin, fingers along +y, the palm toward +z; a right hand's thumb on -x, a
  left hand's on +x (it is the mirror). `fwd` and `palm` place it in body space. Shapes: `RELAXED`, `OPEN`, `FIST`,
  `PINCH` (thumb pad on index pad), `grip(r)` (round a bar of radius r lying across the palm at y 40..44,
  z 7 + r), `flat(curl, thumb=(x, y, z))` (under something flat, the thumb's tip pressed where you say), or your own
  dict: `fingers=[(spread, bend, bend, bend)] * 4`, `thumb=(spread, lift, bend, bend)`, `thumb_tip=(x, y, z)`
  (right-hand coordinates even for the left hand).
- Hold things for real: put the prop in the hand's space where the shape closes (a bar at (x, 40..44, 7 + r) along
  x; a flat thing on the palm from z 7), then aim the thumb at its surface. Two hands on one prop: place the prop in
  one hand's space, then work out the other hand's wrist, fwd and palm from it (see `count`).
- Faces: `smile` (right, left corners, -1..1), `gaze` (x, y of the irises), `lids` (0 shut .. 1), `squint`,
  `brow_lift`; head mods per character in its dict (jaw, chin, nose, hook, brow, cheek, jowl, neck, eye, width).

## Done means

- It reads at 1x in the game's frame (title px x 3): who, doing what, where, at a glance; and holds up zoomed x3.
- The caption box (top left, about 80 x 20 title px) covers nothing that matters; sound words and balloons too.
- A professional would sign it: anatomy, hands, faces, weight, staging, light.

## Checklist before handing a panel over

- Hands grip things: fingers round the bar, the thumb on the object's surface, no finger through a prop.
- Nothing floats: feet on the floor, props in hands or on a surface, a contact shadow (or ink) where things touch.
- One light per surface, its direction readable; shadows cast the way the light goes; rims only where a light is.
- No stray shapes: crop at x3 and look for specks, holes, a sleeve's open end, z-fighting, lines that end nowhere.
- No doubling, no gradients, no dither. Deterministic: run twice, compare bytes.
- `python tools/generate_comic.py` passes its size asserts; `npm test` green; ASCII-only source.
