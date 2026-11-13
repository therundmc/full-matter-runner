// Physical materials. mu = sliding friction on a "neutral" floor, bounce = restitution,
// sound = impact sound family, chips = colour of the splinters/flakes it sheds.
export const MATERIALS = {
  wood: { mu: 0.5, bounce: 0.15, sound: 'wood', chips: '#7a4a2a' },
  metal: { mu: 0.4, bounce: 0.25, sound: 'metal', chips: '#9a9aa8', sparks: true },
  glass: { mu: 0.35, bounce: 0.1, sound: 'glass', chips: '#bff6ff' },
  ceramic: { mu: 0.45, bounce: 0.1, sound: 'ceramic', chips: '#eeeeee' },
  plastic: { mu: 0.4, bounce: 0.3, sound: 'plastic', chips: '#333333' },
  fabric: { mu: 0.8, bounce: 0.05, sound: 'soft', chips: '#9a1f2a' },
  flesh: { mu: 0.75, bounce: 0.05, sound: 'flesh', chips: '#8a1010' },
  concrete: { mu: 0.7, bounce: 0.1, sound: 'stone', chips: '#b8ae98' },
  rubber: { mu: 0.9, bounce: 0.5, sound: 'soft', chips: '#141418' },
  brass: { mu: 0.3, bounce: 0.5, sound: 'shell', chips: '#d8a040' },
};

// how grippy each floor is (multiplies the object's own friction coefficient)
export const FLOOR_GRIP = {
  wood: 1, checker: 0.8, tile_blue: 0.75, carpet_red: 1.35, carpet_purple: 1.35, concrete: 1.05, grass: 1.5,
  asphalt: 1.15, asphalt_line: 1.1, dirt: 1.4, sidewalk: 1.05, neon_floor: 0.8,
};
