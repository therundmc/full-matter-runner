# The comic's art bible

One artistic direction for every still: **William Vance's XIII** (late-80s Franco-Belgian realistic adventure) in
our **neon-noir palette**. Realistic, adult, cinematic; a confident black ink line and big designed blacks; flat
colours under them (no gradient, no dither, no screentone, no blur). Every still is painted by code
(`python tools/generate_comic.py`, deterministic, Pillow only).

Reference panels: `count` and `door` (tools/comic/panels/opening2.py, opening1.py), `sleep` (opening1.py) for a wide
scene with the hero. Do / don't crops: `python tools/comic/dodont.py <out-dir> [<dir of the old stills>]` writes
`do_dont_face.png` (flat light, no blacks, no lines / Vance light), `do_dont_hands.png` (rendered mitts / inked
hands) and `do_dont_figures.png` (thin-lined bodies / bodies with weight and the bold line), each against the stills
of the folder given. The hand library: `python tools/comic/sheet.py <sheet.png> <hands.png>` (all the designs, 2x).
The main session keeps a rendered set in its scratchpad (`.../scratchpad/comic/`).

## The package

| file | what |
|---|---|
| `generate_comic.py` (tools/) | the entry point: paints every registered panel, asserts its size, writes assets/sprites/comic/ |
| `comic/kit.py` | 2D: `Cv` (fill, ink, brush, rect, ellipse, mask), `T`, `spline`, the palette, `backlit`, `ripples`, `window_night`, `rain_beads`, `@panel(name, size)` |
| `comic/solid.py` | the 3D toon renderer: `Scene`, `Skin`, `Xf`, meshes (`tube`, `grid`, `box`, `sheet`, `merge`), `ypr`, `frame`, `rot` |
| `comic/anatomy.py` | the parts: `Head` (lofted, features and inked lines painted on, `FACE_LINES`), `Body` (spine, IK arms and legs), `stance` (contrapposto), `Fold` / `sleeve_folds` / `trouser_folds`, `Hand` and its shapes, `shoe` |
| `comic/cast.py` | the characters (`HERO`, `HEAVY`, `SLICK`, `YOUNG`, `BOSS`), `Figure` (with `hand_place`, `draw_hands`), `Light`, `wrist_for`, `drape_tex` |
| `comic/hands.py` | the hands, drawn not rendered: `DESIGNS[pose][view]`, `draw`, `place`, `aim`, `MITTEN` |
| `comic/props.py` | `brick` and `riffled` (money), `torch`, `crowbar`, `jerrycan` |
| `comic/legacy.py` | the first pass's 2D heads and silhouettes, for the panels not yet redrawn: never in new work |
| `comic/panels/<page>.py` | one module per page; each panel a function decorated `@panel('name', (w, h))` |
| `comic/sheet.py`, `comic/dodont.py` | the model sheet and the do / don't crops (not shipped) |

Panel names and sizes are fixed (the game's layouts and tests depend on them), and so are the points the game draws
over: FLAME, GAP, CLOCK and the clock's colon box (its ground `#1a0608`), the window PANE of `sleep` (360..590 x
8..132), ALLEY_END, ALLEY_PUDDLES, DRIVE_MIRROR, DRIVE_GLASS, OFFICE_SMOKE, OFFICE_DRIP, MATCH_COVER, the doorway
664..828 x 8..222 of `door` (the tube's flicker darkens that box). ui/cine/Panels.js, Leap.js, Ending.js read them:
if one has to move, stop and say so. Nothing is ever doubled off register, in the stills or live.

## 1. The ink line

The line IS the drawing, not an outline round coloured shapes, and it is BOLD: the stills are seen smaller than
their px on screen, so a 1 px line thins out to nothing. At our resolution (SC = 3 panel px per title px):

| line | weight (panel px) | how |
|---|---|---|
| a form against the background, close-up (s 1.0..1.6) | 4 on its dark side, 3 round the rest | `Scene(ink=4)` (ink - 1 all round, +1 away from the light; the default at s >= 0.9) |
| a figure's contour, full figure (s 0.2..0.6) | 2 at the least, 3 on its dark side | `Scene(ink=3)` (the default under s 0.9) |
| a contour break (one form in front of another: the jaw over the neck, an arm over the chest) | 2 | `Scene(inner=2)` (the default) |
| a fold inside a form (a crease, the fingers side by side) | 1 | `Scene(crease_w=1)`; `Skin(creases=False)` to drop them |
| a penciller's interior line (plane breaks, folds of cloth, the lines of a face, tendons) | 2 tapering to 1 | painted by the skins (`FACE_LINES`, `Fold`, `drape_tex`); `Figure` keeps them at least 2 px at any scale |
| a drawn hand | 3 round it (2 small), 1..2 between its parts, interior lines 2 -> 1 | `hands.draw` |
| furniture, walls, props in 2D | 3..5 for big shapes, 3 for small, brushes tapered 3 -> 1 for folds and cracks | `cv.ink`, `cv.brush` |

Lines thin out inside the light and thicken where they meet a shadow; where a line runs into a black, let the
black swallow it (it does by itself: inked lines are skipped where the light has gone to black).

## 2. The blacks

Vance spots big solid blacks. They are designed shapes, not computed specks.

- `Light(deep=1.0)` makes the deepest tone pure INK; `Scene(blacks=t)` sends what is turned further from the key
  than t (n . light < t) and what is in a cast shadow to it. Close-ups: `blacks=0.0`; a back-lit group:
  `blacks=-0.55` (a little modelling left in the dark); the model sheet: `-0.05`.
- `Scene(simplify=7..9)` (an odd size) cleans the shapes of specks and merges small planes into a few big ones:
  always on a close-up (9 on `count`), 5..7 on full figures.
- A face goes half black where the light dictates (`do_dont_face.png`); keep the eyes readable: give the face its own
  threshold (`Figure(face_black=-0.1..-0.35)`) so the jaw and the neck stay off black when the hair and the collar
  already are (a black jaw joined to black hair reads as long hair).
- Paper, money, an eye's white never go black: `Skin(blacks=False)` (props does it for the notes).
- Backgrounds: whole walls black, the light only where it falls (the lamp's wedge, the window's throw). Put a black
  foreground silhouette in front when the panel allows (the armchair in `door`), with a neon rim along its top.
- Rim lights (`backlit` 2 px, or `Scene(rims=...)` + `rim_px` 2..3) live on the edge of a black; only where that
  light is (no pink rim against the cyan doorway).

## 3. Clothes and their folds

No tube limbs, no straight sleeves.

- Sleeves bunch inside the elbow and spiral round the forearm, a drag line runs from the armpit, the cuff bunches
  (`sleeve_folds`, automatic in `Figure`); trousers break behind and across the knee and over the shoe
  (`trouser_folds`); a long coat drapes from the hips to the hem (`DRAPES`, `drape_tex`) and breaks at the
  shoulders. The cloth also bunches out along each fold (`Fold.depth`), so the silhouette is not a tube.
- A fold is a line that starts thin, swells, and ends in a point or in a black hollow; folds radiate from where the
  cloth is pulled (a bent joint, a hip under a sheet) and hang from where it is held.
- 2D cloth (a sheet, a curtain): lay it over the real shape underneath (see `sleep`: the sheet's top is the envelope
  of his hips and legs seen from the camera), light along its top, black in its hollows, 3..5 bold curved folds.

## 4. Gesture: nobody stands at attention

Checklist for every figure:
- weight on one leg (`stance('l' | 'r', ...)`): that foot under the head, its hip up, the other knee bent, the free
  foot out and turned;
- shoulders tilted against the hips (contrapposto: `hips`, `shoulders`), the chest turned off the pelvis (`turn`);
- a head tilt and a turn of its own; the eyes on something (`gaze`);
- the hands doing something: holding, gripping a prop, a fist, a thumb in a pocket, on a door frame; never two
  relaxed hands hanging the same way;
- a lean when he acts (`lean`), the arms bent (elbows never locked).

## 5. Framing

- Pick a camera before drawing: low angle on menace (`door`: `Scene(keystone=(cx, floor_y, 0.2))` draws the men in
  toward the top as seen from low, `ypr(yaw, -5)` shows under the chins), over the shoulder (a black shoulder and
  head in the foreground, the subject beyond), a close-up insert (one hand, one object, `count`).
- Depth by overlap: foreground silhouette black, middle ground lit, background in flat night tones.
- Leave the caption box (top left, about 80 x 20 title px = 240 x 60 panel px) and the balloons free of faces and
  hands.
- `Scene(persp=(D, cx, cy))` exists for a close foreground that should loom; keep D large (>= 1500).

## 6. Faces

Realistic, adult, characterful, strong noses and brows. Vance's men are square-jawed and lined.
- Head mods in each character's dict: jaw, chin, nose, hook, brow, cheek, jowl, eye, width; `lines` picks the inked
  ones from `FACE_LINES` (naso, bags, cheek, jaw, forehead, crows, chin, marionette, furrow); `heavy_lids` for the
  boss (older, heavy lids). Stubble (`beard`) darkens the jaw: use it on every man but the boss.
- Expression: `smile` (right, left corners), `gaze`, `lids`, `squint`, `brow_lift`. Push them: nobody's face is at
  rest. The sheet's moods (sheet.py `MOODS`): the hero hard, the heavy scowling (brows down, squint, mouth down), the
  slick one smug (one brow and one corner up), the young one grinning, the boss heavy-lidded and sour.

## Light, per panel

1. Colours: `light = Light(key=..., fill=..., deep=1.0)`: key is what the light is (lamp `#ffc890`, tube `#7ad8e4`,
   neon `#ff7aa8`, fire `FIRE_L`), fill what the half-shadow is bathed in (`#3a3658`..`#5a4a90`).
2. Direction: `Scene(w, h, light=(dx, dy, dz) toward the light, ...)` (x right, y DOWN, z toward us). Side light for
   faces half in black: `(-0.75, -0.3, 0.6)`; under-light: `(-0.75, 0.5, 0.45)`; back-lit: `(0.15, -0.35, -0.92)`; a
   window above: `(0.15, -0.9, 0.05)`. A lamp in the panel: `lamp=(x, y, z)`.
3. One face may take its own key (`Figure(head_light=...)`): it is then shadowed only by its own head (the
   illustrator's cheat in `count`: the lamp lights his face from below, the money from in front).
4. `Scene.add(..., cast=False)`, `Figure(hand_shadows=False)`: a prop or the hands throw no shadow.

## Using the cast

```python
light = Light(key=hx('#ffc890'), fill=hx('#5a4a90'), deep=1.0)
pose = stance('l', hips=7, shoulders=5, turn=8)                  # weight on his left leg
pose.update(head=ypr(-12, 10, 5), wrist_r=(...), elbow_r=(...))   # IK target and elbow pole, body space
fig = Figure(SLICK, pose=pose, hands=dict(r=dict(pose='torch', view='side', angle=-8, mirror=True)),
             face=dict(smile=(0.15, 0.85), gaze=(-1.6, 2.6), lids=0.45), face_black=-0.3)
place = Xf(ox, oy, s, ypr(-40))          # body space -> panel px: (ox, oy) is where his feet stand
sc = Scene(W, H, light=(-0.6, 0.3, 0.75), scale=s, ink=4, inner=2, blacks=0.05, simplify=9)
fig.add(sc, place, light)                # the body; its hands are not rendered
sc.add(prop_mesh, prop_skin, fig.hand_xf('l', place).at(...))   # a 3D prop, if any, in a hand's 3D frame
mask = sc.render(cv)                     # then backlit(cv, mask, ...) for rims on a black figure
fig.draw_hands(cv, sc, place, light)     # the hands, inked, where the arms end
```

- Body space: he faces +z, his right ('r') on -x, the floor at y 0, up -y, 7.5 heads (a head 100, 1 unit 2.3 mm).
  Arms 144 + 120: a wrist out of reach floats the hand off its prop: check.
- A hand's 3D frame (for its arm and for a 3D prop): wrist at the origin, fingers +y, palm +z; a right hand's thumb
  on -x, a left's on +x; `fwd` and `palm` in the hands dict, else along the forearm.

## 7. Hands: drawn, never rendered

A rendered hand at our resolution is a mitt. Hands are inked drawings (tools/comic/hands.py), placed where the 3D
arm ends:
- A design is a right hand in its own units (100 from the wrist to the middle fingertip, wrist at (0, 0), fingers
  up): shapes in order (the back or the palm, the thumb with its fleshy base, fingers as tapered planes broken at the
  joints, square knuckles, nails), each with a black plane cut along its own length on the side away from the light
  (`shadow`: how much of it, 0.25..0.45), a thin line where the shapes lie on each other and a heavy one round the
  whole hand, two or three interior lines (the knuckle row, a tendon, the thumb's crease). Never a grid of finger
  lines.
- The library (`DESIGNS[pose][view]`): relaxed (back, palm, side), fist and grip (front, side: round a bar),
  hook (front: holding a flat thing by its edge, the knuckles to us), pinch and match (side), point (side), open
  (back, palm), riffle (side: the thumb over a stack's edge), torch (side, the torch drawn with it), can (back:
  hooked on a handle). See `.../scratchpad/comic/hands.png`. A new pose is a new function: draw it there, look at it
  at 3x, give it anchors.
- Drawn a little larger than life: 95 units (life is 82; about the face from chin to brow and more), a little
  shorter when it points at us. Small (under 44 px), it becomes a silhouette: a mitten, its thumb, one line
  (`MITTEN`, `MITT_FIST`).
- In a figure: the hands dict's `pose`, `view` (else from where the palm looks), `angle` (else along the fingers),
  `mirror` (else from the thumb's side), `size`, `aim=(anchor, body point)`: turned and sized so that the design's
  anchor ('edge', 'thumb', 'bar', 'pinch', 'lens', 'tip') lands on that point of the prop. `Figure.hand_place`
  gives where a hand goes before drawing (to start a torch's beam at `hands.place(..., name='lens')`).
- What is behind and in front: parts on the design's 'back' layer hide behind what is nearer in the render (the
  brick over the palm), 'front' parts show over it (the fingers hooked over its edge); both hide behind the body when
  it is nearer.
- No paddle hands (a flat open palm under an object), no claws (fingers splayed for nothing): hold, grip, hook,
  press, point.
- `Figure(bare=True)`: the hero at home (grey knit, hair to his collar, no cap, coat, scarf or satchel). Lying down:
  roll the placement (`ypr(0, 0, -90)`: on his right side, head to the left, facing us).

## Done means

- It reads at 1x in the game's frame: who, doing what, where, at a glance; and holds up zoomed x3.
- A professional would sign it next to a Vance page: anatomy, gesture, hands, faces, the blacks, the line.

## Checklist before handing a panel over

- Hands are drawn (section 7) and grip things: fingers round the bar, the thumb on the object's surface; crop
  each at 3x and ask whether a comic artist would sign it.
- Nothing floats: feet on the floor, props in hands or on a surface, a contact shadow (a black) where things touch.
- Every figure passes the gesture checklist (section 4); clothes fold (section 3).
- One light per surface, its direction readable; big blacks designed, no specks; rims only where a light is.
- No stray shapes: crop at x3 and look for specks, holes, z-fighting, a black that turns a jaw into hair, lines
  that end nowhere.
- No doubling, no gradients, no dither. Deterministic: run twice, compare bytes.
- `python tools/generate_comic.py` passes its size asserts; `npm test` green; ASCII-only source.
