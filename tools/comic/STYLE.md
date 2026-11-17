# The comic's art bible

One artistic direction for every still: **William Vance's XIII** (late-80s Franco-Belgian realistic adventure) in
our **neon-noir palette**. Realistic, adult, cinematic; a confident black ink line and big designed blacks; flat
colours under them (no gradient, no dither, no screentone, no blur). Every still is painted by code
(`python tools/generate_comic.py`, deterministic, Pillow only).

Reference panels: `count` and `door` (tools/comic/panels/opening2.py, opening1.py), `sleep` (opening1.py) for a wide
scene with the hero. Do / don't crops: `python tools/comic/dodont.py <out-dir> [<dir of the old stills>]` writes
`do_dont_face.png` (flat light, no blacks, no lines / Vance light), `do_dont_hands.png` (paddle claws / a hand that
grips) and `do_dont_figures.png` (stick figures doubled off register / bodies with weight). The main session keeps a
rendered set in its scratchpad (`.../scratchpad/comic/dodont/`).

## The package

| file | what |
|---|---|
| `generate_comic.py` (tools/) | the entry point: paints every registered panel, asserts its size, writes assets/sprites/comic/ |
| `comic/kit.py` | 2D: `Cv` (fill, ink, brush, rect, ellipse, mask), `T`, `spline`, the palette, `backlit`, `ripples`, `window_night`, `rain_beads`, `@panel(name, size)` |
| `comic/solid.py` | the 3D toon renderer: `Scene`, `Skin`, `Xf`, meshes (`tube`, `grid`, `box`, `sheet`, `merge`), `ypr`, `frame`, `rot` |
| `comic/anatomy.py` | the parts: `Head` (lofted, features and inked lines painted on, `FACE_LINES`), `Body` (spine, IK arms and legs), `stance` (contrapposto), `Fold` / `sleeve_folds` / `trouser_folds`, `Hand` and its shapes, `shoe` |
| `comic/cast.py` | the characters (`HERO`, `HEAVY`, `SLICK`, `YOUNG`, `BOSS`), `Figure`, `Light`, `hand_parts`, `wrist_for`, `in_hand`, `drape_tex` |
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

The line IS the drawing, not an outline round coloured shapes. At our resolution (SC = 3 panel px per title px; the
game shows a still at about 1 to 2 screen px per panel px):

| line | weight (panel px) | how |
|---|---|---|
| a figure's contour, close-up (s 1.0..1.6) | 2, +1 on the side away from the light | `Scene(ink=2)` (the +1 is automatic) |
| a figure's contour, full figure (s 0.2..0.5) | 1, +1 away from the light at s >= 0.4 | `Scene(ink=1 or 2)` |
| a contour break (one form in front of another: the jaw over the neck, an arm over the chest) | 2 close-up, 1 small | `Scene(inner=...)` |
| a fold inside a form (a crease, the fingers side by side) | 1 | `Scene(crease_w=1)`; `Skin(creases=False)` to drop them (small hands) |
| a penciller's interior line (plane breaks, folds of cloth, the lines of a face, tendons) | 1..2 model-unit wide, never under 1 px | painted by the skins (`FACE_LINES`, `Fold`, `drape_tex`): `Figure` keeps them >= 1 px at any scale |
| furniture, walls, props in 2D | 3..5 for big shapes, 2 for small, brushes tapered 3 -> 0.5 for folds and cracks | `cv.ink`, `cv.brush` |

Lines thin out inside the light and thicken where they meet a shadow; where a line runs into a black, let the
black swallow it (it does by itself: inked lines are skipped where the light has gone to black).

## 2. The blacks

Vance spots big solid blacks. They are designed shapes, not computed specks.

- `Light(deep=1.0)` makes the deepest tone pure INK; `Scene(blacks=t)` sends what is turned further from the key
  than t (n . light < t) and what is in a cast shadow to it. Close-ups: `blacks=0.0`; a back-lit group:
  `blacks=-0.55` (a little modelling left in the dark); the model sheet: `-0.05`.
- `Scene(simplify=5..7)` (an odd size) cleans the shapes of specks: always on a close-up.
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
- Expression: `smile` (right, left corners), `gaze`, `lids`, `squint`, `brow_lift`.

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
fig = Figure(SLICK, pose=pose, hands=dict(r=dict(shape=grip(5.4), fwd=(...), palm=(...))),
             face=dict(smile=(0.15, 0.85), gaze=(-1.6, 2.6), lids=0.45), face_black=-0.3)
place = Xf(ox, oy, s, ypr(-40))          # body space -> panel px: (ox, oy) is where his feet stand
sc = Scene(W, H, light=(-0.6, 0.3, 0.75), scale=s, ink=2, inner=2, blacks=0.0, simplify=7)
fig.add(sc, place, light)
for m, skin in props.torch(light):
    sc.add(m, skin, fig.hand_xf('r', place).at((22, 40, 12.5), rot((0, 0, 1), 90)))
mask = sc.render(cv)                     # then backlit(cv, mask, ...) for rims on a black figure
```

- Body space: he faces +z, his right ('r') on -x, the floor at y 0, up -y, 7.5 heads (a head 100, 1 unit 2.3 mm).
  Arms 144 + 120: a wrist out of reach floats the hand off its prop: check.
- A hand's own space: wrist at the origin, fingers +y, palm +z; a right hand's thumb on -x, a left's on +x.
- Hold things for real: put the prop in body space (or in one hand's space), then place each hand on it with
  `wrist_for(fwd, palm, at=<body point>)` (where its middle knuckle goes) and aim its thumb with
  `thumb_tip=in_hand(side, fwd, palm, wrist, <body point>)`. Shapes: `RELAXED`, `OPEN`, `FIST`, `PINCH`, `grip(r)`,
  `flat(curl, thumb)` or a dict `fingers=[(spread, bend, bend, bend)] * 4, thumb=(spread, lift, bend, bend),
  thumb_tip=...`. Fingers that wrap an edge: knuckle bend small, middle joint 90..96, last 60..64 (`count`'s left
  hand: we see the knuckles, the tips hook over the top). No paddle hands: a flat open palm under an object is a
  don't.
- `Figure(bare=True)`: the hero at home (grey knit, hair to his collar, no cap, coat, scarf or satchel). Lying down:
  roll the placement (`ypr(0, 0, -90)`: on his right side, head to the left, facing us).

## Done means

- It reads at 1x in the game's frame: who, doing what, where, at a glance; and holds up zoomed x3.
- A professional would sign it next to a Vance page: anatomy, gesture, hands, faces, the blacks, the line.

## Checklist before handing a panel over

- Hands grip things: fingers round the bar, the thumb on the object's surface, no finger through a prop.
- Nothing floats: feet on the floor, props in hands or on a surface, a contact shadow (a black) where things touch.
- Every figure passes the gesture checklist (section 4); clothes fold (section 3).
- One light per surface, its direction readable; big blacks designed, no specks; rims only where a light is.
- No stray shapes: crop at x3 and look for specks, holes, z-fighting, a black that turns a jaw into hair, lines
  that end nowhere.
- No doubling, no gradients, no dither. Deterministic: run twice, compare bytes.
- `python tools/generate_comic.py` passes its size asserts; `npm test` green; ASCII-only source.
