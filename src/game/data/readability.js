// Readability (render/Readability.js, the light floor in render/Lighting.js, the outline of a weapon in hand in
// entities/CharacterAnim.js): what must be told at a glance in a crowded, dim bar - who is who, who holds what, what
// lies on the floor - said quietly, in the world's own look. No arcade marker over the scene; every cue fades out
// with the distance from the player and is never drawn where he could not see.
export const READABILITY = {
  // a cue is whole up to `near` px from the player and gone at `far`
  fade: { near: 5 * 32, far: 10 * 32 },

  // a weapon lying on the floor: a catch-light runs along its edge, once every `period` s (each its own phase), for
  // `run` s; `alpha` at its brightest, `band` sprite-wide share of it lit at once
  glint: { period: 2.5, run: 0.4, alpha: 0.9, band: 0.25, color: [255, 238, 205] },

  // the weapon within reach (E / the click would take it): its outline, pulsing at `rate` rad/s about `alpha`
  reach: { alpha: 0.6, pulse: 0.25, rate: 9, color: [5, 217, 232] },

  // the weapon in somebody's hands: a dark rim round it (torso px off it, alpha), a gun's darker than a melee weapon's
  held: { px: 0.7, gun: 0.75, melee: 0.45 },

  // the light floor (Lighting.lightFloor): nobody and no weapon on the floor in view is lit less than `level` (0..1,
  // the brightness grid's scale, Lighting.levelAt, a man's own small light LIGHTING.charLight counted in); at most
  // `max` is added, in a pool of the night's `color`, radius `r` px about a man, `item` px about a weapon. Where a
  // lamp reaches the grid is above it: nothing is added there (no washed-out colour under a neon tube).
  floor: { level: 0.62, max: 0.3, r: 24, item: 14, color: '#b9a8ff' },
};
