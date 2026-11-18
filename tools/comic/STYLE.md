# The comic's art bible: NEON POSTER

One artistic direction for every still (the user's pick, 2026-11-17): **cut paper, in the manner of the 60s-80s film
poster (Saul Bass)**, in the game's neon night. A violet ground, black, and a few flat inks; no ink line; every shape a
slightly crooked flat polygon; people are cut-out signs; strong diagonals; repetition tells the story; caricature over
realism. Every still is cut by code (`python3 tools/generate_comic.py`, deterministic, Pillow only).

Reference panels: `door` (the three men, a wedge of light, shadows as spikes), `count` (seen from above, repetition),
`match` (a close-up made of five shapes). The sheets (the cast, LUCKY's options, the cards, the
overview of the 16 stills): `python3 tools/comic/sheet.py <out-dir>`.

## The package

| file | what |
|---|---|
| `generate_comic.py` (tools/) | the entry point: paints every registered panel, asserts its size, writes assets/sprites/comic/ |
| `comic/kit.py` | the canvas `Cv` (`poly`, `disc`, `bar`, `path`, `paste`, masks to clip and cut), the inks, `slab` (a rectangle cut by hand), `star` (a burst), `turned`, `bead`, the lettering (`text_mask`, `digits`), `@panel(name, size)` |
| `comic/poster.py` | the cast as signs: `cueball`, `lucky`, `jitters`, `boss`, `runner` (side on, through `man`) and `ABOVE` / `above` (from straight above; the runner's is `RUNNER_COAT` + `RUNNER_CAP`, the cap alone lies on the options' table); set pieces: `boards`, `board_gaps`, `brick`, `window`, `torch`, `crowbar`, `jerrycan` |
| `comic/panels/<page>.py` | one module per page; each panel a function decorated `@panel('name', (w, h))` |
| `comic/panels/cards.py` | the full-screen cards (see The cards) |
| `comic/sheet.py` | the sheets: cast, LUCKY's options, cards, overview (not shipped) |

Panel names and sizes are fixed (the game's layouts and tests depend on them), and so are the points the game draws
over, each a named constant in its panel module and in the JS that reads it: `PANE`, `CLOCK` (its ground `#1a0608`,
the colon at 172, 154), `DOORWAY` (opening1.py / ui/cine/Panels.js), `SPOUT` and `POOL` (opening2.py; the petrol's drops run from
the spout to `SPLASH`, on the pool lying flat on the floor), `FLAME`, `MOUTH`, `GAP` (opening3.py; `MOUTH` is the balloon's tail in ui/Cinematic.js),
`ALLEY_SIGN`, `ALLEY_PUDDLES` (leap.py / Leap.js), `DRIVE_VP`, `DRIVE_LINE`, `DRIVE_CAR`, `DRIVE_LIGHTS`, `OFFICE_SMOKE`, `OFFICE_DRIP`,
`MATCH_COVER` (ending.py / Ending.js). Move one, move the other, and look at the page in the game.
The sound words (KRAK, KRRIK, GLUG GLUG, SKRITCH, FWOOMP, RRRING), the captions, the balloons and FLAMINGO MOTEL are
lettered live by the game: never letter them into a still (they would double). Lettering inside a still is only
what is written in the scene (the clock's 1:05).

## 1. The inks

| ink | constant | what it is for |
|---|---|---|
| violet night | `NIGHT` `#170b2b`, `NIGHT_L` `#2a1548`, `NIGHT_LL` `#3d2a6a` | the ground: a wall, a dark thing lifted off it, a thing a light finds |
| black | `INK` `#0a070c` | floors, people, shadows, furniture against a light |
| bone | `BONE` `#f2e8d2`, `BONE_D` `#b8a890` | paper, money, metal, CUEBALL's bald head, THE BOSS |
| pink | `PINK` `#ff3a7a`, `PINK_D` `#8a1d5c` | the bar's neon and its light, LUCKY's scarf |
| cyan | `CYAN` `#3ad8e8`, `CYAN_D` `#17566e` | the tube on the landing, the torch's pool, JITTERS' crest; `CYAN_D` is also the runner's petrol blue (his coat's lining, the collar's rim, the brim's edge) |
| fire | `FIRE` `#ff8a20`, `FIRE_D` `#c8381a` | from the match on (page 3), the jerrycan, a lit cigar, sodium street lamps |
| a big fire | `FIRE_L` `#ffc83a`, `FIRE_DD` `#6e1616` | the title only: the yellow heart of a flame (its core is bone), a lit window; the fire's red on a wall far off |
| blood | `BLOOD` `#a0141e` | blood, nothing else (and the marker's X on the hit list) |
| fluo yellow | `FLUO` `#e6ff1a` | CUEBALL's shades, nothing else |
| the runner's | `TAN` `#c8905c`, `BROWN` `#5a3a26`, `CAP` `#2c2838` | THE RUNNER only: the slit of his face, his hair and his satchel with its strap, his cap seen from above |

- Flat, always: no gradient, no dither, no screentone, no blur, no outline. A light is a shape in its `_D` ink, its
  core in the full ink (the match's two discs, a wedge and its rays).
- A panel uses black, the violets and two or three inks, one of them dominant. Pages have a temperature: page 1 pink
  and cyan, page 2 cyan, page 3 fire.
- **A man never stands against his own ink** (CUEBALL's shades on yellow or bone, LUCKY's scarf on pink, JITTERS on
  cyan): his sign would go.
  Put him on another ink, on its dark (`CYAN` on `CYAN_D` reads), or on black.

## 2. The shapes

- Everything is a polygon cut by hand: no two edges quite parallel, corners a few px off (`slab(x0, y0, x1, y1, seed,
  k)` does it for rectangles). Discs are allowed for lights, lamps, pools, an eye.
- Few and big: a panel is five to fifteen shapes that matter. If a detail needs a line, it is not in the picture.
- Diagonals carry the panel: a wedge of light from a door, a window, a gap; shadows are long black spikes inside the
  wedge, one per man, from his feet to the frame's edge.
- Repetition tells the story: the bricks in rows, the boards, the blind's bars, the street lamps getting smaller,
  the rays under the door.
- Three views only: side on (a stage: wall, floor line, things standing on it), straight from above (the game's own
  view: boards on a slant, a pool of light, people as their signs), a close-up made of very few shapes (a profile,
  an eye, a matchbook).
- Black on black is allowed and wanted: a sofa lost in the floor, a man's coat in his shadow (but a light never
  stops at a black thing for no reason: where the torch's beam crosses the sofa in `door`, the sofa shows lit). What must read is
  staged against a light.

## 3. People: cut-out signs

No anatomy, no face, no fingers. A man is a body of two to five black slabs and ONE signature, on his head or carried. `man(cv,
who, cx, foot, h, pose, face, body)` cuts him side on; `above(cv, name, cx, cy, s, deg)` from straight above. A fist is
a black lump at the end of a slab; what he holds (a bar, a can, a torch, a match) is cut in bone or fire and says
what the hand does. A close-up is still a sign: a profile is one black shape with a nose and a chin, an eye is an
almond, a disc and a lid.

## 4. The cast

Each of the boss's three men has a name, a build pushed to caricature, and one loud signature: a colour and a shape,
on the head or carried, the same in the comic and from above in the game. Only one of them is a hairdo (JITTERS).
The game's guards take their signatures from this
table (top-down, a man is about 26 px across the shoulders; `ABOVE` in poster.py is the drawing to follow).

| name | who | build | signature | ink | from above (26 px) |
|---|---|---|---|---|---|
| **CUEBALL** | the heavy: the torch and the crowbar, the one who speaks for the boss; level 1's mini-boss, with a shotgun, dead in its ending (his shades off, cracked, on the floor) | a wall on short legs, twice a man's width, no neck, a bald bone dome | huge wrap-round shades, wider than his head | fluo yellow | the widest shoulders in the game (about 30 px), black; in their middle a bone disc of 12 px; across its front a fluo yellow band 4 px deep and as wide as the disc and more (it shows where he faces) |
| **LUCKY** | the slick one, the man with the match | a beanpole, a head taller than anyone, in a coat to his ankles; hair slicked flat to a point at the nape; pointed shoes | a long scarf: a loud band round his neck, one end down his front, the other flying behind him | pink | a man first: the coat's black shoulders (about 28 px), a black head with the slick's point at the nape and a sliver of brow in front (where he looks), an arm held out when he reaches; the pink a band round his nape, open in front (never a closed ring: a ring and a streamer read as a wrench), and one short end down his back, off to one side, no further than the shoulders (`lucky_above`, its `reach`) |
| **JITTERS** | the young one: the jerrycan | a runt, three quarters of a man, hunched, knees bent | a saw-tooth crest | cyan | small black shoulders (about 20 px); a cyan saw-tooth lozenge from the nape to past the brow, its teeth on both sides |
| **THE BOSS** | he owns the city, the bar with it; the campaign's last target, never seen in level 1: in its ending he is the telephone ringing (bone, his ink) | wide, soft, double-breasted | he is the one man cut in bone: the suit, with a black tie; a slick of black hair; a cigar, no bigger than a cigar | bone body | bone shoulders (about 27 px), a black head; the cigar 5 px straight ahead, its tip 2 px of fire |
| **THE RUNNER** | the player | lean, in a duster to just below the knee, its back vent open to the waist; a satchel on a strap across him (`BROWN`); boots | TWO shapes, the low CAP and the long COAT's split tails. The cap (`RUNNER_HAT`, `hat()` cuts it alone): it reads by its silhouette, a round low dome, highest over the brow, its button a nub on top, and the brim a short wedge, thick at its root and dipping a little, its underside petrol (never a thin stick straight out, never the long brim, never a flat ivy cap, a helmet or a hooked brim), a hard line of shadow under it across the slit. A funnel collar closed up to his nose, black, the petrol gaiter showing only as a band at its rim; between cap and collar a slit of tan that is all his face; brown hair to the collar behind. The coat: two tails swept back behind him as wedges, in every still, even standing (the wind has them): the near one black, the far one showing its petrol lining. Sat or driving, the tails lie where he sits or are out of frame, and the cap and the collar carry him | black, petrol blue (`CYAN_D`) | black shoulders; behind them the two tails, black wedges trailing 12 to 14 px, the petrol lining in the vent between them (they show where he faces by where they trail); the cap a round dark crown (`CAP`, a shade off the coat) of 9 to 10 px with a 1 px petrol button, its brim a short crescent as wide as the crown at its root, 2 to 3 px ahead of it, its front edge petrol; behind, 2 px of brown hair and the collar's petrol rim at the nape; the strap a brown diagonal across the shoulders to the satchel on his hip (`RUNNER_COAT` + `RUNNER_CAP` in poster.py). Never a scarf (that is LUCKY's: his streamer is pink, thin, from the neck; the tails are black and petrol, wide, from the waist), never a mask of an animal, never bright turquoise (CLAUDE.md, Art) |

Rules for the three:
- The sign is always there and readable: never under a caption or a balloon, never against its own ink, never
  cropped by the frame (stand a man seen from above far enough into the panel for what he has on his back).
- Their bodies are black and nothing else; no second colour on them. What they carry is the only other ink.
- Sizes side on, for the same floor line: CUEBALL 100, LUCKY about 90 (his own units make him taller and thinner),
  JITTERS about 90 (he is 70 of them tall); see `door` and `pour`.
- Who does what in the opening: CUEBALL forces the door and the board, holds the torch and says "NO LOOSE ENDS.";
  LUCKY, his scarf flying, stands over the money and strikes the match ("TORCH IT.");
  JITTERS carries the can and pours.
- LUCKY's pink thing was chosen by the user on a sheet (`sheet.py`, lucky_options.png: a scarf, a pack, gloves,
  braces, a bag across him): the scarf. `poster.LUCKY_GEAR` switches the figure and its top-down drawing; the panels
  are staged for the scarf. An earlier bat was too big and a pompadour too close to JITTERS: a sign is not a hairdo
  (he has the only one) nor a weapon.


## The cards

`panels/cards.py` paints one full-screen still a man (384 x 216 title px): `target_cueball`, `target_lucky`,
`target_jitters`, `target_boss` (front on, on a slab of an ink that is not his, his name, what he is, his sign in
words, and how he reads from above), for a screen between levels that shows the targets (not built yet), and
`card_runner` in the same manner for a title or a menu. They are the only stills with lettering in them: nothing
is drawn live over them.

## The title

The title is the comic's cover and the LEVELS page his board (`title_art.py`, written out by `python3
tools/comic/title.py`: the layers in assets/sprites/title/, and src/game/data/titleart.js, where things are in them;
the game: src/game/ui/title/).

- **The poster**: three layers the mouse shifts against each other in whole px: the sky with the four as shadows
  (their black the night's violets, their signs in full ink), the city black before the fire's glow (a disc) with
  his building, the wet street with THE RUNNER, black, the fire on his right edges. His building is a tenement in a few big
  crooked shapes, no finer than the rest (the user found a detailed one clashed, and a plain block childish): the
  block under its cornice, the water tank, the fire escape as a Z, two windows a floor. A flame is tongues one in
  the other: `FIRE`, `FIRE_L`, and on the roof a bone core.
- **Live on it** (Poster.js), in steps like stop motion, flat: the fire comes down a floor at a time (a lit window
  stutters, goes dark, then burns), two columns of smoke bent by the wind (black before the glow, violet over the
  night), embers, ash; the rain is thin and BEHIND him and the logo: a few long cuts, orange where they pass the
  fire, pink by the sign; each sign has its own life (a glint along the shades, the scarf and the crest failing
  like tubes, the cigar drawn on). Nothing crosses his head.
- **The logo**: letters cut by hand (`GLYPHS`), FULL MATTER in bone, RUNNER pink on black tiles: a neon sign in
  cut paper; a letter that fails goes to the pink's dark.
- **The hit list**: the board on a black wall, a bar of light across it; the photo of his flat, the four cards in
  the order he takes them (the next in his card's ink, the others in the board's violet, the dead gone dark under
  a red X), a red string from pin to pin as far as he has got, the matchbook once CUEBALL is dead. The menu is
  bone notes pinned to it.
- **The options** (from the title and the pause): what he carries, laid out. His table from above, boards on a
  slant, the lamp's pool, the satchel's corner; a thing a section down the left (the walkman AUDIO, the portable
  set VIDEO, the knuckles CONTROLS, the notebook GAME, his cap BACK), its name on a strip of tape. The chosen one
  is lifted onto a slab of an ink that is not its own; its settings are on a sheet of bone paper beside it, a
  wedge pointing at it (pale while it is only shown): a slider is pink tape pulled along a black line, a toggle a
  switch, the chosen line has a black wedge before it.
- **The pause's panel**: a black sheet on a pink one that shows along two edges, a violet bar across it, PAUSED on
  a bone tab.

## What moves

The game draws over the stills, flat and in their px, from the panel's own clock (ui/cine/Panels.js, Leap.js,
Ending.js): never a blur, never a gradient, nothing that hides a sign or crosses a balloon's tail.

| still | what moves | fixed points (JS) |
|---|---|---|
| `sleep` | rain down the pane, the pink sign buzzing, the clock's colon | `PANE`, `NEON`, `COLON` |
| `door` | the tube failing, dust in the torch's beam (no burst at the lock, no splinters: too much) | `DOORWAY`, `BEAM` |
| `pry` | dust, the panel jolting on KRRIK | |
| `box` | glints opening and shutting on the bricks | the tin's grid |
| `count` | nothing (falling notes were too much) | |
| `pour` | the petrol's drops, drops thrown up where it lands, rings going out over the pool on the floor | `SPOUT` (540, 122), `SPLASH` (on `POOL`) |
| `match` | sparks and the flame, its light ducking | `FLAME` |
| `fire` | the tongues under the door, embers going up, the light breathing | `GAP` |
| `wake` | the fire alive in his pupil, the light breathing | `PUPIL` |
| `alley` | rain, rings on the puddles, both signs flickering, a drip off the fire escape | `SIGN`, `PUDDLES` |
| `drive` | the road's middle line running back from under the car, the spray off its back wheels, rain (a wide shot: the boss's convertible small from behind, roof down, bone, its two fins with a red blade of light each, its seats `PINK_D`, him at the wheel with his coat's tails thrown up, the boss's bone hat on the back seat, the city far off; never a close-up of him) | `ROAD`, `WHEELS` |
| `office` | the handset shaken by each ring, the smoke off the dropped shotgun in puffs, the blood's drip | `MUZZLE`, `DRIP` |
| `matchbook` | a glint sliding across the cover, FLAMINGO MOTEL lettered | `COVER` |

## 5. Staging a panel

1. One idea: what the caption cannot say. Write it as the panel function's docstring first.
2. Pick the view (section 2) and the light: which ink, coming from where, as a wedge or a pool.
3. Put what must read against that light; let the rest go into the black.
4. Leave the caption (top left: about 130 x 20 title px for two lines, 190 x 12 for one long line) and the balloon
   free of signs. A balloon's tail must reach the mouth without crossing a sign, a flame or what he holds.
5. Check the game's live overlays for that panel (the table in "The package") before moving anything.

## Done means

- It reads in the game's frame at a glance: who (by his sign), doing what, where.
- It could hang as a poster: a few big shapes, one diagonal, one dominant ink.
- `python3 tools/generate_comic.py` passes its size asserts and gives the same bytes twice; `npm test` green; ASCII
  only; the page looked at in the game (tools/shot.mjs).
