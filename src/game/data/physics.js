// How loose furniture answers being leaned on, struck and dragged (systems/PropPhysics.js, entities/Prop.js; the
// engine side: engine/physics/Push.js, Friction.js, Body.js). Speeds in m/s, masses in kg, momenta in N.s, lengths
// in px unless noted. What the floor does to it: data/materials.js (FLOOR_GRIP, SURFACE, SLIDE, MATERIALS stick).

// Leaning into it: a character pushes with at most PHYSICS.pushForce (Config) when running, `walk` of that when he
// only walks into it (in between, by his speed over a run's).
export const PUSH = {
  walk: 0.45,
  reach: 40,          // px between his centre and the prop's beyond which no contact is looked for
};

// A blow hands the prop momentum at the point it lands (off its centre it spins it): `per` N.s per unit of the
// hit's power (Prop.hit's `power`: a melee blow is 2.5, a pistol round 1, a pellet 0.6, a graze 0.3), by kind;
// heft[d.heft]: a light club (a cue) hits softer than a bat. A sharp blow beats static friction a slow push
// struggles with; a heavy prop only nudges.
export const BLOW = {
  per: { punch: 4.8, blunt: 12, cut: 3.2, bullet: 4, rifle: 7, pellet: 5, graze: 4, blast: 47, shrapnel: 47 },
  heft: { 1: 0.7, 2: 1 },
};

// The marks a heavy or hard thing leaves where it is dragged over a hard floor: short thin streaks from its feet
// (a box's corners, a round base's rim either side of its way), kept very faint and never piled up.
//   speed: m/s it must scrape at, kg: lighter leaves none, step: px dragged between two marks, inset: px its feet
//   stand in from its outline, alpha [light, heavy] by kg (heavy at `heavyKg`), width px, color, surface: how much a
//   kind of floor shows them (carpet and soft ground none), cell / cap: at most `cap` marks a `cell` px square,
//   budget: marks a second in all.
//   wet: off a wet floor it wipes the liquid along for `strokes` marks, a smear of `alpha` x the liquid's own.
export const SCUFF = {
  speed: 0.8, kg: 4, step: 6, inset: 1.5, alpha: [0.035, 0.075], heavyKg: 60, width: 0.7, color: '#140c16',
  surface: { boards: 0.8, tile: 1, rough: 0.55 },
  cell: 8, cap: 3, budget: 60,
  wet: { strokes: 8, alpha: 0.5 },
};

// The sound of it dragged or rolled along (placeholders: assets/sound/PLACEHOLDERS.md): one play every `every` s
// while it moves faster than `speed` m/s on the floor, louder with speed (full at `full` m/s) and weight (full at
// `heavyKg`); by its feet's material, `roll` for a lying cylinder rolling.
export const SCRAPE = {
  speed: 0.5, full: 3, heavyKg: 40, every: 0.3,
  sounds: { wood: 'scrapeWood', metal: 'scrapeMetal', plastic: 'scrapePlastic', ceramic: 'scrapeCeramic', fabric: 'dragSoft' },
  roll: 'rollMetal',
};
