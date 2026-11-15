// Where things stand in the title scene (logical px) and how far away they are. Seen level with the elevated line:
// its riveted truss bridge big across the lower part of the picture, the train passing on it, and behind them two glass
// towers, their tops in the picture, with the sky over them and a wide slit between them where the buildings far off
// stand and the sun goes down (the logo sits in that sky).

// parallax factor of each depth (how much it moves with the eye)
export const F = { clouds: 0.01, far: 0.025, towers: 0.06, el: 0.2 };
export const EYE = 82;                           // eye level: the train's reflection in the glass lies above it

// the slit between the towers; each tower: its glass from x0 to x1 up to `top`, the solid crown on it ([x0, x1, top]),
// a mast (its x and top), its glass grid (mullion pitch, floor height)
export const GAP = { x0: 120, x1: 262 };
export const TOWERS = [
  { x0: -70, x1: GAP.x0, top: 22, crown: [8, 98, 14], cell: 5, floor: 7, seed: 3 },
  { x0: GAP.x1, x1: 460, top: 40, crown: [286, 342, 34], mast: { x: 308, top: 10 }, cell: 6, floor: 7, seed: 8 },
];

// the elevated line: the train's roof, the top of its flank, the bottom of its body, the rails (the top of the deck
// girder); the bridge: the deck girder it runs on (top chord), the truss under it (posts, X bracing), the bottom chord
// with the lower deck behind it; the floodlights on the posts; the name plate on the bottom chord
export const EL = {
  roof: 90, side: 96, body: 131, rail: 138,
  chord: [138, 150], bottom: [192, 201], posts: [-54, 42, 138, 234, 330, 426], post: 8,
  lamps: [42, 330], plate: { x: 70, y: 194, text: 'HARROW ST' },
};
export const DECK = 194;                         // where the lower deck's traffic stands (the car's wheels)

// colours of the lights, as rgb strings for the stepped halos
export const RGB = { sodium: '255,170,70', red: '255,40,40', blue: '60,110,255', white: '235,240,255', spark: '190,225,255', warm: '255,214,150' };
