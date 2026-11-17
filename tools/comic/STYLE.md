# The comic's art bible: NEON POSTER

One artistic direction for every still (the user's pick, 2026-11-17): **cut paper, in the manner of the 60s-80s film
poster (Saul Bass)**, in the game's neon night. A violet ground, black, and a few flat inks; no ink line; every shape a
slightly crooked flat polygon; people are cut-out signs; strong diagonals; repetition tells the story; caricature over
realism. Every still is cut by code (`python3 tools/generate_comic.py`, deterministic, Pillow only).

Reference panels: `door` (the three men, a wedge of light, shadows as spikes), `count` (seen from above, repetition),
`match` (a close-up made of five shapes). The cast sheet and the overview of the 16 stills:
`python3 tools/comic/sheet.py <cast.png> [<overview.png>]`.

## The package

| file | what |
|---|---|
| `generate_comic.py` (tools/) | the entry point: paints every registered panel, asserts its size, writes assets/sprites/comic/ |
| `comic/kit.py` | the canvas `Cv` (`poly`, `disc`, `bar`, `path`, `paste`, masks to clip and cut), the inks, `slab` (a rectangle cut by hand), `star` (a burst), `turned`, `bead`, the lettering (`text_mask`, `digits`), `@panel(name, size)` |
| `comic/poster.py` | the cast as signs: `cueball`, `lucky`, `jitters`, `boss`, `runner` (side on, through `man`) and `ABOVE` / `above` (from straight above); set pieces: `boards`, `board_gaps`, `brick`, `window`, `torch`, `crowbar`, `jerrycan` |
| `comic/panels/<page>.py` | one module per page; each panel a function decorated `@panel('name', (w, h))` |
| `comic/sheet.py` | the cast sheet and the overview (not shipped) |

Panel names and sizes are fixed (the game's layouts and tests depend on them), and so are the points the game draws
over, each a named constant in its panel module and in the JS that reads it: `PANE`, `CLOCK` (its ground `#1a0608`,
the colon at 172, 154), `DOORWAY` (opening1.py / ui/cine/Panels.js), `SPOUT` (opening2.py; the petrol's drops run from
it to 518, 180), `FLAME`, `MOUTH`, `GAP` (opening3.py; `MOUTH` is the balloon's tail in ui/Cinematic.js),
`ALLEY_SIGN`, `ALLEY_PUDDLES` (leap.py / Leap.js), `DRIVE_MIRROR`, `DRIVE_GLASS`, `OFFICE_SMOKE`, `OFFICE_DRIP`,
`MATCH_COVER` (ending.py / Ending.js). Move one, move the other, and look at the page in the game.
The sound words (KRAK, KRRIK, GLUG GLUG, SKRITCH, FWOOMP, RRRING), the captions, the balloons and FLAMINGO MOTEL are
lettered live by the game: never letter them into a still (they would double). Lettering inside a still is only
what is written in the scene (the clock's 1:05).

## 1. The inks

| ink | constant | what it is for |
|---|---|---|
| violet night | `NIGHT` `#170b2b`, `NIGHT_L` `#2a1548`, `NIGHT_LL` `#3d2a6a` | the ground: a wall, a dark thing lifted off it, a thing a light finds |
| black | `INK` `#0a070c` | floors, people, shadows, furniture against a light |
| bone | `BONE` `#f2e8d2`, `BONE_D` `#b8a890` | paper, money, metal, CUEBALL's bald head, THE BOSS, his cigar's smoke |
| pink | `PINK` `#ff3a7a`, `PINK_D` `#8a1d5c` | the bar's neon and its light, LUCKY's bat |
| cyan | `CYAN` `#3ad8e8`, `CYAN_D` `#17566e` | the tube on the landing, the torch's pool, JITTERS' crest; `CYAN_D` is also the runner's petrol blue |
| fire | `FIRE` `#ff8a20`, `FIRE_D` `#c8381a` | from the match on (page 3), the jerrycan, a lit cigar, sodium street lamps |
| blood | `BLOOD` `#a0141e` | blood, nothing else |
| fluo yellow | `FLUO` `#e6ff1a` | CUEBALL's shades, nothing else |

- Flat, always: no gradient, no dither, no screentone, no blur, no outline. A light is a shape in its `_D` ink, its
  core in the full ink (the match's two discs, a wedge and its rays).
- A panel uses black, the violets and two or three inks, one of them dominant. Pages have a temperature: page 1 pink
  and cyan, page 2 cyan, page 3 fire.
- **A man never stands against his own ink** (CUEBALL's shades on yellow or bone, LUCKY's bat on pink, JITTERS on
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
- Black on black is allowed and wanted: a sofa lost in the floor, a man's coat in his shadow. What must read is
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
| **CUEBALL** | the heavy: the torch and the crowbar, the one who speaks for the boss | a wall on short legs, twice a man's width, no neck, a bald bone dome | huge wrap-round shades, wider than his head | fluo yellow | the widest shoulders in the game (about 30 px), black; in their middle a bone disc of 12 px; across its front a fluo yellow band 4 px deep and as wide as the disc and more (it shows where he faces) |
| **LUCKY** | the slick one, the man with the match | a beanpole, a head taller than anyone, in a coat to his ankles; hair slicked flat to a point at the nape; pointed shoes | a big baseball bat, his weapon, over his shoulder (`stand`) or planted like a cane (`plant`); `bat(knob, end, width)` | pink | narrow black shoulders (about 22 px), a small black head with the slick's point behind; the bat a pink bar about 24 px long from his fist before his right shoulder, back and out at some 50 degrees, thin at the handle, 4 to 5 px across the barrel, a knob at the fist. When he swings it, it is the same bar, forward |
| **JITTERS** | the young one: the jerrycan | a runt, three quarters of a man, hunched, knees bent | a saw-tooth crest | cyan | small black shoulders (about 20 px); a cyan saw-tooth lozenge from the nape to past the brow, its teeth on both sides |
| **THE BOSS** | level 1's boss, dead in the ending | wide, soft, double-breasted | he is the one man cut in bone: the suit, with a black tie; a slick of black hair; a cigar far too big (a third of his height), its ember, its smoke in three growing bone puffs | bone body | bone shoulders (about 27 px), a black head; the cigar a bar of 10 px straight ahead, its ember 2 px of fire, a puff or two of bone drifting off it |
| **THE RUNNER** | the player | a long coat, collar up, a cap | the scarf over his mouth, its tail behind | petrol blue (`CYAN_D`) | black shoulders, the cap's peak forward, the scarf a petrol band round the nape with a tail (see CLAUDE.md, Art, for his full description in the game) |

Rules for the three:
- The sign is always there and readable: never under a caption or a balloon, never against its own ink. A head sign
  is never cropped by the frame; the bat may run out of it.
- Their bodies are black and nothing else; no second colour on them. What they carry is the only other ink.
- Sizes side on, for the same floor line: CUEBALL 100, LUCKY about 90 (his own units make him taller and thinner),
  JITTERS about 90 (he is 70 of them tall); see `door` and `pour`.
- Who does what in the opening: CUEBALL forces the door and the board, holds the torch and says "NO LOOSE ENDS.";
  LUCKY, the bat on his shoulder, taps the tin with it, stands over the money and strikes the match ("TORCH IT.");
  JITTERS carries the can and pours.
- A pink bag was weighed against the bat for LUCKY: the bat won everywhere (a bag is a lump from above and hides
  behind him side on; the bat is a long bar in both views).


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
