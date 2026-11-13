// Rooftop dressing of the neighbouring buildings: `level.roof` = [[kind, col, row, deg?], ...] (centre, in tiles).
// Scenery only: painted once on the wall layer (render/MapRenderer.js) from the sprites roof/<kind>, never simulated.
// h = height in px (how far the cast shadow reaches). light = what glows through or on the piece (render/Lighting.js;
// r, x, y in px in the sprite's frame): above the street, so never shadowed and never counted by the stealth grid.
export const ROOF_DECOR = {
  ac_unit: { h: 5 },
  vent: { h: 4 },
  duct: { h: 3 },
  hatch: { h: 2 },
  chimney: { h: 7 },
  tank: { h: 10 },
  antenna: { h: 6 },
  bulkhead: { h: 9, light: { r: 56, color: '#ffb46a', intensity: 0.75, y: 30, flicker: true } }, // lamp over the door
  skylight: { h: 2, light: { r: 62, color: '#ffc27a', intensity: 0.8 } },
  skylight_tv: { h: 2, light: { r: 54, color: '#7fb4ff', intensity: 0.75, flicker: 'tv' } },
  skylight_dark: { h: 2 },
};
